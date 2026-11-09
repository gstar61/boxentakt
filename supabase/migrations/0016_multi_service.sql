-- Mehrere Leistungen in einer Buchung (z. B. Schnitt + Farbe): ein Termin über die Summe der Dauer,
-- Preis = Summe der Preise der Person, Bezeichnung „A + B“. Salon-Logo für die Mails in den Rückgaben.
alter table public.appointments add column service_ids uuid[];

create or replace function public.book_services(p_slug text, p_services uuid[], p_staff uuid, p_start timestamptz, p_name text, p_phone text, p_email text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; b public.salon_billing; v_local timestamp; v_end timestamptz; v_range tstzrange; v_minutes int; v_names text;
  v_staff uuid; v_staff_name text; v_customer uuid; v_appt public.appointments; v_phone_norm text; v_deposit int; v_price int;
begin
  select * into s from public.salons where slug = p_slug;
  if not found then raise exception 'salon_not_found'; end if;
  if not public.salon_bookable(s.id) then raise exception 'not_bookable'; end if;
  if p_services is null or cardinality(p_services) = 0 or cardinality(p_services) > 4
     or cardinality(p_services) <> (select count(distinct x) from unnest(p_services) x) then raise exception 'service_not_found'; end if;
  if (select count(*) from public.services where id = any(p_services) and salon_id = s.id and active) <> cardinality(p_services)
    then raise exception 'service_not_found'; end if;
  -- order as chosen by the customer
  select sum(sv.duration_min), string_agg(sv.name, ' + ' order by o.n)
    into v_minutes, v_names
    from unnest(p_services) with ordinality o(id, n) join public.services sv on sv.id = o.id;
  select * into b from public.salon_billing where salon_id = s.id;

  p_name := btrim(coalesce(p_name, '')); p_phone := nullif(btrim(coalesce(p_phone, '')), '');
  p_email := nullif(lower(btrim(coalesce(p_email, ''))), ''); p_note := nullif(btrim(coalesce(p_note, '')), '');
  if length(p_name) < 2 or length(p_name) > 100 then raise exception 'invalid_name'; end if;
  if p_phone is null or length(regexp_replace(p_phone, '\D', '', 'g')) < 6 then raise exception 'invalid_phone'; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  v_phone_norm := nullif(regexp_replace(regexp_replace(p_phone, '\D', '', 'g'), '^(00)?49', '0'), '');

  if coalesce(b.charges_enabled, false) and s.deposit_percent > 0 and p_email is null then raise exception 'email_required'; end if;

  if (select count(*) from public.appointments a
      where a.salon_id = s.id and a.source = 'online' and a.created_at > now() - interval '10 minutes') >= 20
    then raise exception 'rate_limited'; end if;
  if (select count(*) from public.appointments a join public.customers c on c.id = a.customer_id
      where a.salon_id = s.id and c.phone_norm = v_phone_norm and a.status = 'gebucht' and lower(a.during) > now()) >= 3
    then raise exception 'too_many'; end if;

  if p_start < now() + interval '15 minutes' or p_start > now() + make_interval(days => s.booking_days)
    then raise exception 'outside_window'; end if;
  v_local := p_start at time zone s.timezone;
  if (extract(epoch from v_local::time)::int / 60) % s.slot_step <> 0 then raise exception 'invalid_time'; end if;
  v_end := p_start + make_interval(mins => v_minutes);
  v_range := tstzrange(p_start, v_end);
  if not exists (select 1 from public.opening_hours h
                 where h.salon_id = s.id and h.weekday = extract(dow from v_local)
                   and v_local::time >= h.opens
                   and (v_end at time zone s.timezone) <= v_local::date + h.closes)
    then raise exception 'closed'; end if;

  perform public.release_expired_holds();

  select st.id, st.name into v_staff, v_staff_name from public.staff st
   where st.salon_id = s.id and st.active and (p_staff is null or st.id = p_staff)
     and not exists (select 1 from public.appointments a where a.staff_id = st.id and a.status <> 'storniert' and a.during && v_range)
     and not exists (select 1 from public.absences ab where ab.salon_id = s.id
                     and (ab.staff_id is null or ab.staff_id = st.id) and ab.during && v_range)
   order by st.sort, st.name limit 1;
  if v_staff is null then raise exception 'slot_taken'; end if;

  select sum(coalesce(sp.price_cents, sv.price_cents)) into v_price
    from public.services sv left join public.staff_prices sp on sp.service_id = sv.id and sp.staff_id = v_staff
   where sv.id = any(p_services);
  v_deposit := case when coalesce(b.charges_enabled, false) and s.deposit_percent > 0
                    then greatest(round(v_price * s.deposit_percent / 100.0)::int, 50) end;

  select c.id into v_customer from public.customers c
   where c.salon_id = s.id and c.phone_norm = v_phone_norm order by c.created_at limit 1;
  if v_customer is null then
    insert into public.customers (salon_id, name, phone, email)
    values (s.id, p_name, p_phone, p_email) returning id into v_customer;
  else
    update public.customers set name = p_name, email = coalesce(p_email, email) where id = v_customer;
  end if;

  begin
    insert into public.appointments (salon_id, staff_id, service_id, service_ids, customer_id, service_name, price_cents, during, source, note,
                                     deposit_cents, payment_status, payment_expires_at)
    values (s.id, v_staff, p_services[1], p_services, v_customer, v_names, v_price, v_range, 'online', p_note,
            v_deposit, case when v_deposit is not null then 'pending' end,
            case when v_deposit is not null then now() + interval '35 minutes' end)
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object('id', v_appt.id, 'cancel_token', v_appt.cancel_token, 'salon_slug', s.slug,
    'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email, 'salon_logo', s.logo_url,
    'timezone', s.timezone, 'staff_name', v_staff_name, 'service_name', v_names,
    'price_cents', v_price, 'starts_at', p_start, 'ends_at', v_end, 'deposit_cents', v_deposit);
end $$;

-- alte Einzel-Buchung bleibt erreichbar und nutzt dieselbe Logik
create or replace function public.book_appointment(p_slug text, p_service uuid, p_staff uuid, p_start timestamptz, p_name text, p_phone text, p_email text, p_note text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.book_services(p_slug, array[p_service], p_staff, p_start, p_name, p_phone, p_email, p_note);
$$;

revoke all on function public.book_services(text, uuid[], uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.book_services(text, uuid[], uuid, timestamptz, text, text, text, text) to anon, authenticated;

-- Erinnerung: Salon-Logo mitliefern (Rückgabetyp ändert sich → neu anlegen)
drop function public.take_due_reminders(text);
create function public.take_due_reminders(p_key text)
returns table (email text, customer_name text, service_name text, starts_at timestamptz, staff_name text, salon_name text,
               salon_phone text, timezone text, cancel_token uuid, salon_logo text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where name = 'cron_key' and value = p_key) then
    raise exception 'forbidden';
  end if;
  perform public.release_expired_holds();
  return query
  with due as (
    update public.appointments a set reminder_sent_at = now()
    from public.salons s, public.customers c
    where s.id = a.salon_id and c.id = a.customer_id
      and a.status = 'gebucht' and coalesce(a.payment_status, '') <> 'pending'
      and a.reminder_sent_at is null and c.email is not null
      and (lower(a.during) at time zone s.timezone)::date = ((now() at time zone s.timezone)::date + 1)
    returning a.id
  )
  select c.email, c.name, a.service_name, lower(a.during), st.name, s.name, s.phone, s.timezone, a.cancel_token, s.logo_url
  from due join public.appointments a on a.id = due.id
  join public.salons s on s.id = a.salon_id join public.customers c on c.id = a.customer_id
  join public.staff st on st.id = a.staff_id;
end $$;
revoke all on function public.take_due_reminders(text) from public;
grant execute on function public.take_due_reminders(text) to anon, authenticated;

-- Bestätigung nach bezahlter Anzahlung: Logo mitliefern
create or replace function public.stripe_appointment_paid(p_key text, p_appt uuid, p_payment_intent text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.appointments;
begin
  perform public.stripe_check_key(p_key);
  begin
    update public.appointments set payment_status = 'paid', payment_expires_at = null, stripe_payment_intent = p_payment_intent,
           status = case when status = 'storniert' then 'gebucht' else status end
     where id = p_appt and payment_status in ('pending', 'expired')
    returning * into a;
  exception when exclusion_violation then
    return jsonb_build_object('conflict', true);
  end;
  if not found then return null; end if;
  return (select jsonb_build_object('id', a.id, 'cancel_token', a.cancel_token, 'salon_slug', s.slug,
      'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email, 'salon_logo', s.logo_url,
      'timezone', s.timezone, 'staff_name', st.name, 'service_name', a.service_name, 'price_cents', a.price_cents,
      'starts_at', lower(a.during), 'ends_at', upper(a.during), 'deposit_cents', a.deposit_cents,
      'customer', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'note', a.note))
    from public.salons s, public.staff st, public.customers c
    where s.id = a.salon_id and st.id = a.staff_id and c.id = a.customer_id);
end $$;
