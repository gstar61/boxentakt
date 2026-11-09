-- Boxentakt: Fahrzeug im Termin (Kennzeichen, Klasse, Hinweis) und Klassenzuschlag je Betrieb.
-- Klasse pkw/suv/transporter: Zuschlag in Minuten und Cent liegt je Betrieb in salons.class_extra.
alter table public.appointments
  add column license_plate text check (length(license_plate) <= 12),
  add column vehicle_class text not null default 'pkw' check (vehicle_class in ('pkw', 'suv', 'transporter')),
  add column vehicle_info text check (length(vehicle_info) <= 120);
alter table public.salons
  add column class_extra jsonb not null default '{"pkw":{"min":0,"cents":0},"suv":{"min":15,"cents":1000},"transporter":{"min":30,"cents":2000}}';
create index on public.appointments (salon_id, license_plate);

create or replace function public.public_salon(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name', s.name, 'address', s.address, 'phone', s.phone, 'notice', s.notice,
    'legal_name', s.legal_name, 'contact_email', s.contact_email, 'vat_id', s.vat_id, 'legal_extra', s.legal_extra,
    'timezone', s.timezone, 'slot_step', s.slot_step, 'booking_days', s.booking_days,
    'logo_url', s.logo_url, 'cover_url', s.cover_url, 'class_extra', s.class_extra,
    'bookable', public.salon_bookable(s.id),
    'deposit_percent', case when coalesce(b.charges_enabled, false) then s.deposit_percent else 0 end,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.sort, st.name)
                       from public.staff st where st.salon_id = s.id and st.active), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name,
                          'duration_min', sv.duration_min, 'price_cents', sv.price_cents,
                          'staff_prices', coalesce((select jsonb_object_agg(sp.staff_id, sp.price_cents)
                                                    from public.staff_prices sp join public.staff st on st.id = sp.staff_id and st.active
                                                    where sp.service_id = sv.id), '{}'::jsonb)) order by sv.sort, sv.name)
                       from public.services sv where sv.salon_id = s.id and sv.active), '[]'::jsonb),
    'holiday_state', s.holiday_state,
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('day', ph.day, 'name', ph.name) order by ph.day)
                          from public.public_holidays(s.holiday_state, (now() at time zone s.timezone)::date,
                                                      (now() at time zone s.timezone)::date + s.booking_days) ph), '[]'::jsonb),
    'special_days', coalesce((select jsonb_agg(jsonb_build_object('day', sd.day, 'opens', to_char(sd.opens, 'HH24:MI'),
                                 'closes', to_char(sd.closes, 'HH24:MI'), 'note', sd.note) order by sd.day)
                              from public.special_days sd where sd.salon_id = s.id
                                and sd.day between (now() at time zone s.timezone)::date and (now() at time zone s.timezone)::date + s.booking_days), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                          'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday, h.opens)
                       from public.opening_hours h where h.salon_id = s.id), '[]'::jsonb))
  from public.salons s left join public.salon_billing b on b.salon_id = s.id
  where s.slug = p_slug;
$$;

drop function if exists public.book_appointment(text, uuid, uuid, timestamptz, text, text, text, text);
drop function if exists public.book_services(text, uuid[], uuid, timestamptz, text, text, text, text);

create function public.book_services(p_slug text, p_services uuid[], p_staff uuid, p_start timestamptz, p_name text, p_phone text, p_email text, p_note text,
  p_plate text default null, p_class text default 'pkw', p_vehicle text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; b public.salon_billing; v_local timestamp; v_end timestamptz; v_range tstzrange; v_minutes int; v_names text;
  v_staff uuid; v_staff_name text; v_customer uuid; v_appt public.appointments; v_phone_norm text; v_deposit int; v_price int; v_extra_min int := 0; v_extra_cents int := 0;
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

  -- Fahrzeug: Kennzeichen ist Pflicht, die Klasse bestimmt Zuschlag in Minuten und Cent
  p_class := lower(btrim(coalesce(p_class, 'pkw')));
  if p_class not in ('pkw', 'suv', 'transporter') then raise exception 'invalid_vehicle'; end if;
  p_plate := upper(regexp_replace(btrim(coalesce(p_plate, '')), '\s+', ' ', 'g'));
  if p_plate !~ '^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 -]{2,11}$' then raise exception 'invalid_plate'; end if;
  p_vehicle := nullif(left(btrim(coalesce(p_vehicle, '')), 120), '');
  v_extra_min := coalesce((s.class_extra -> p_class ->> 'min')::int, 0);
  v_extra_cents := coalesce((s.class_extra -> p_class ->> 'cents')::int, 0);
  v_minutes := v_minutes + v_extra_min;

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
  if not exists (select 1 from public.day_intervals(s.id, v_local::date) h
                 where v_local::time >= h.opens
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
  v_price := v_price + v_extra_cents;
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
                                     deposit_cents, payment_status, payment_expires_at, license_plate, vehicle_class, vehicle_info)
    values (s.id, v_staff, p_services[1], p_services, v_customer, v_names, v_price, v_range, 'online', p_note,
            v_deposit, case when v_deposit is not null then 'pending' end,
            case when v_deposit is not null then now() + interval '35 minutes' end,
            p_plate, p_class, p_vehicle)
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object('id', v_appt.id, 'cancel_token', v_appt.cancel_token, 'salon_slug', s.slug,
    'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email, 'salon_logo', s.logo_url,
    'timezone', s.timezone, 'staff_name', v_staff_name, 'service_name', v_names,
    'price_cents', v_price, 'starts_at', p_start, 'ends_at', v_end, 'deposit_cents', v_deposit,
    'license_plate', p_plate, 'vehicle_class', p_class);
end $$;

revoke all on function public.book_services(text, uuid[], uuid, timestamptz, text, text, text, text, text, text, text) from public;
grant execute on function public.book_services(text, uuid[], uuid, timestamptz, text, text, text, text, text, text, text) to anon, authenticated;


-- Startwerte für neue Betriebe: Werkstatt-Leistungen, Mo–Fr 8–17 Uhr
create or replace function public.create_salon(p_name text, p_slug text, p_staff_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_email text; v_salon uuid;
begin
  select lower(u.email) into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'not_confirmed'; end if;
  p_name := btrim(coalesce(p_name, '')); p_slug := lower(btrim(coalesce(p_slug, ''))); p_staff_name := btrim(coalesce(p_staff_name, ''));
  if length(p_name) < 2 or length(p_name) > 80 then raise exception 'invalid_name'; end if;
  if not public.slug_available(p_slug) then raise exception 'slug_taken'; end if;
  if (select count(*) from public.salon_members m where m.user_id = v_uid and m.role = 'owner' and m.active) >= 3 then raise exception 'too_many_salons'; end if;

  insert into public.salons (slug, name, owner_email) values (p_slug, p_name, v_email) returning id into v_salon;
  insert into public.salon_members (salon_id, user_id, role) values (v_salon, v_uid, 'owner');
  insert into public.staff (salon_id, name, sort) values (v_salon, coalesce(nullif(p_staff_name, ''), 'Werkstatt'), 1);
  insert into public.opening_hours (salon_id, weekday, opens, closes)
  select v_salon, d, '08:00', '17:00' from generate_series(1, 5) d;
  insert into public.services (salon_id, name, duration_min, price_cents, sort) values
    (v_salon, 'Räderwechsel (Sommer/Winter)', 45, 4900, 1),
    (v_salon, 'Räderwechsel mit Einlagerung', 45, 5900, 2),
    (v_salon, 'Ölwechsel inkl. Filter', 60, 8900, 3),
    (v_salon, 'Inspektion', 120, 14900, 4),
    (v_salon, 'HU/AU', 60, 12900, 5),
    (v_salon, 'Bremsencheck', 30, 0, 6),
    (v_salon, 'Achsvermessung', 60, 8900, 7);
  return p_slug;
end $$;


-- Bestätigung nach bezahlter Anzahlung: Kennzeichen mitliefern
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
      'license_plate', a.license_plate,
      'customer', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'note', a.note))
    from public.salons s, public.staff st, public.customers c
    where s.id = a.salon_id and st.id = a.staff_id and c.id = a.customer_id);
end $$;
