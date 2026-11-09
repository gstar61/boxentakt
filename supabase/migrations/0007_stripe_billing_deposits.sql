-- Abo (19 €/Monat nach 30 Tagen Test), Online-Anzahlung über das eigene Stripe-Konto des Salons (Connect)

-------------------------------------------------------------------------------
-- Abo-/Connect-Status pro Salon. Mitglieder dürfen nur lesen; geschrieben wird
-- ausschließlich serverseitig über stripe_billing_update (Schlüssel 'stripe_key').
-------------------------------------------------------------------------------
create table public.salon_billing (
  salon_id uuid primary key references public.salons (id) on delete cascade,
  exempt boolean not null default false,
  trial_ends_at timestamptz not null default now() + interval '30 days',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_account_id text,
  charges_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.salon_billing enable row level security;
create policy salon_billing_member_read on public.salon_billing for select to authenticated using (public.is_member(salon_id));

-- Bestandssalons bleiben dauerhaft kostenlos
insert into public.salon_billing (salon_id, exempt) select id, true from public.salons on conflict do nothing;

create or replace function public.salon_billing_init()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.salon_billing (salon_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.salon_billing_init() from public, anon, authenticated;
create trigger salons_billing_init after insert on public.salons
  for each row execute function public.salon_billing_init();

-- Online buchbar: Bestandssalon, Testphase läuft oder Abo aktiv (past_due = Kulanz bis Stripe aufgibt)
create or replace function public.salon_bookable(p_salon uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select b.exempt or b.trial_ends_at > now() or b.subscription_status in ('active', 'trialing', 'past_due')
                   from public.salon_billing b where b.salon_id = p_salon), false);
$$;
revoke all on function public.salon_bookable(uuid) from public, anon;
grant execute on function public.salon_bookable(uuid) to authenticated;

-- Anzahlung in Prozent vom Leistungspreis, 0 = aus. Greift nur mit verbundenem Stripe-Konto.
alter table public.salons add column deposit_percent int not null default 0 check (deposit_percent between 0 and 100);

-------------------------------------------------------------------------------
-- Anzahlung am Termin. Unbezahlte Reservierungen (payment_status 'pending')
-- blockieren die Zeit bis payment_expires_at und werden danach storniert.
-------------------------------------------------------------------------------
alter table public.appointments
  add column deposit_cents int,
  add column payment_status text check (payment_status in ('pending', 'paid', 'refunded', 'expired')),
  add column payment_expires_at timestamptz,
  add column stripe_session_id text,
  add column stripe_payment_intent text;

create or replace function public.release_expired_holds()
returns void language sql security definer set search_path = '' as $$
  update public.appointments set status = 'storniert', payment_status = 'expired'
   where payment_status = 'pending' and payment_expires_at < now();
$$;
revoke all on function public.release_expired_holds() from public, anon, authenticated;

-- Belegte Zeiten: abgelaufene Reservierungen zählen nicht mehr
create or replace function public.busy_intervals(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with s as (select id from public.salons where slug = p_slug),
       win as (select tstzrange(p_from, least(p_to, p_from + interval '62 days')) as r)
  select a.staff_id, lower(a.during), upper(a.during)
  from public.appointments a, s, win
  where a.salon_id = s.id and a.status <> 'storniert' and a.during && win.r
    and not (a.payment_status = 'pending' and a.payment_expires_at < now())
  union all
  select st.id, lower(ab.during), upper(ab.during)
  from public.absences ab
  join s on ab.salon_id = s.id
  join public.staff st on st.salon_id = s.id and (ab.staff_id is null or ab.staff_id = st.id)
  cross join win
  where ab.during && win.r;
$$;

-- Öffentliche Salondaten + Buchbarkeit + wirksame Anzahlung
create or replace function public.public_salon(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name', s.name, 'address', s.address, 'phone', s.phone, 'notice', s.notice,
    'legal_name', s.legal_name, 'contact_email', s.contact_email, 'vat_id', s.vat_id, 'legal_extra', s.legal_extra,
    'timezone', s.timezone, 'slot_step', s.slot_step, 'booking_days', s.booking_days,
    'bookable', public.salon_bookable(s.id),
    'deposit_percent', case when coalesce(b.charges_enabled, false) then s.deposit_percent else 0 end,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.sort, st.name)
                       from public.staff st where st.salon_id = s.id and st.active), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name,
                          'duration_min', sv.duration_min, 'price_cents', sv.price_cents) order by sv.sort, sv.name)
                       from public.services sv where sv.salon_id = s.id and sv.active), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                          'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday, h.opens)
                       from public.opening_hours h where h.salon_id = s.id), '[]'::jsonb))
  from public.salons s left join public.salon_billing b on b.salon_id = s.id
  where s.slug = p_slug;
$$;

-- Buchung: zusätzlich Abo-Prüfung und Anzahlungs-Reservierung
create or replace function public.book_appointment(
  p_slug text, p_service uuid, p_staff uuid, p_start timestamptz,
  p_name text, p_phone text, p_email text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; sv public.services; b public.salon_billing; v_local timestamp; v_end timestamptz; v_range tstzrange;
  v_staff uuid; v_staff_name text; v_customer uuid; v_appt public.appointments; v_phone_norm text; v_deposit int;
begin
  select * into s from public.salons where slug = p_slug;
  if not found then raise exception 'salon_not_found'; end if;
  if not public.salon_bookable(s.id) then raise exception 'not_bookable'; end if;
  select * into sv from public.services where id = p_service and salon_id = s.id and active;
  if not found then raise exception 'service_not_found'; end if;
  select * into b from public.salon_billing where salon_id = s.id;

  p_name := btrim(coalesce(p_name, '')); p_phone := nullif(btrim(coalesce(p_phone, '')), '');
  p_email := nullif(lower(btrim(coalesce(p_email, ''))), ''); p_note := nullif(btrim(coalesce(p_note, '')), '');
  if length(p_name) < 2 or length(p_name) > 100 then raise exception 'invalid_name'; end if;
  if p_phone is null or length(regexp_replace(p_phone, '\D', '', 'g')) < 6 then raise exception 'invalid_phone'; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  v_phone_norm := nullif(regexp_replace(regexp_replace(p_phone, '\D', '', 'g'), '^(00)?49', '0'), '');

  -- Anzahlung: nur mit freigeschaltetem Stripe-Konto, mindestens 0,50 € (Stripe-Minimum)
  v_deposit := case when coalesce(b.charges_enabled, false) and s.deposit_percent > 0
                    then greatest(round(sv.price_cents * s.deposit_percent / 100.0)::int, 50) end;
  if v_deposit is not null and p_email is null then raise exception 'email_required'; end if;

  -- Missbrauchsgrenzen
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
  v_end := p_start + make_interval(mins => sv.duration_min);
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

  -- Stammkunde per Telefonnummer wiedererkennen
  select c.id into v_customer from public.customers c
   where c.salon_id = s.id and c.phone_norm = v_phone_norm order by c.created_at limit 1;
  if v_customer is null then
    insert into public.customers (salon_id, name, phone, email)
    values (s.id, p_name, p_phone, p_email) returning id into v_customer;
  else
    update public.customers set name = p_name, email = coalesce(p_email, email) where id = v_customer;
  end if;

  begin
    insert into public.appointments (salon_id, staff_id, service_id, customer_id, service_name, price_cents, during, source, note,
                                     deposit_cents, payment_status, payment_expires_at)
    values (s.id, v_staff, sv.id, v_customer, sv.name, sv.price_cents, v_range, 'online', p_note,
            v_deposit, case when v_deposit is not null then 'pending' end,
            case when v_deposit is not null then now() + interval '35 minutes' end)
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object('id', v_appt.id, 'cancel_token', v_appt.cancel_token, 'salon_slug', s.slug,
    'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email,
    'timezone', s.timezone, 'staff_name', v_staff_name, 'service_name', sv.name,
    'price_cents', sv.price_cents, 'starts_at', p_start, 'ends_at', v_end, 'deposit_cents', v_deposit);
end $$;

-- Termin per Absage-Link: Anzahlungsstatus und ob sie bei Absage erstattet wird (ab 24 h vorher)
create or replace function public.appointment_by_token(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', a.status, 'service_name', a.service_name, 'price_cents', a.price_cents,
    'starts_at', lower(a.during), 'ends_at', upper(a.during), 'staff_name', st.name,
    'salon_name', s.name, 'salon_slug', s.slug, 'salon_phone', s.phone, 'timezone', s.timezone,
    'deposit_cents', a.deposit_cents, 'payment_status', a.payment_status,
    'deposit_refundable', a.payment_status = 'paid' and lower(a.during) > now() + interval '24 hours',
    'can_cancel', a.status = 'gebucht' and coalesce(a.payment_status, '') <> 'pending' and lower(a.during) > now() + interval '2 hours')
  from public.appointments a join public.salons s on s.id = a.salon_id join public.staff st on st.id = a.staff_id
  where a.cancel_token = p_token;
$$;

create or replace function public.cancel_by_token(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.appointments set status = 'storniert'
   where cancel_token = p_token and status = 'gebucht' and coalesce(payment_status, '') <> 'pending'
     and lower(during) > now() + interval '2 hours';
  return found;
end $$;

-- Erinnerungen nur für bestätigte Termine; abgelaufene Reservierungen nebenbei aufräumen
create or replace function public.take_due_reminders(p_key text)
returns table (email text, customer_name text, service_name text, starts_at timestamptz,
               staff_name text, salon_name text, salon_phone text, timezone text, cancel_token uuid)
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
  select c.email, c.name, a.service_name, lower(a.during), st.name, s.name, s.phone, s.timezone, a.cancel_token
  from due join public.appointments a on a.id = due.id
  join public.salons s on s.id = a.salon_id join public.customers c on c.id = a.customer_id
  join public.staff st on st.id = a.staff_id;
end $$;

-------------------------------------------------------------------------------
-- Serverseitige Stripe-Funktionen (Webhook, Server-Actions), geschützt durch
-- den Schlüssel 'stripe_key' in app_secrets (Env STRIPE_DB_KEY).
-------------------------------------------------------------------------------
create or replace function public.stripe_check_key(p_key text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_key is null or not exists (select 1 from public.app_secrets where name = 'stripe_key' and value = p_key) then
    raise exception 'forbidden';
  end if;
end $$;
revoke all on function public.stripe_check_key(text) from public, anon, authenticated;

create or replace function public.stripe_billing_get(p_key text, p_salon uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.stripe_check_key(p_key);
  return (select to_jsonb(b) || jsonb_build_object('salon_name', s.name, 'owner_email', s.owner_email, 'slug', s.slug)
          from public.salon_billing b join public.salons s on s.id = b.salon_id where b.salon_id = p_salon);
end $$;

-- Setzt nur die übergebenen Felder
create or replace function public.stripe_billing_update(p_key text, p_salon uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.stripe_check_key(p_key);
  update public.salon_billing set
    stripe_customer_id     = case when p ? 'stripe_customer_id' then p->>'stripe_customer_id' else stripe_customer_id end,
    stripe_subscription_id = case when p ? 'stripe_subscription_id' then p->>'stripe_subscription_id' else stripe_subscription_id end,
    subscription_status    = case when p ? 'subscription_status' then p->>'subscription_status' else subscription_status end,
    current_period_end     = case when p ? 'current_period_end' then (p->>'current_period_end')::timestamptz else current_period_end end,
    cancel_at_period_end   = case when p ? 'cancel_at_period_end' then (p->>'cancel_at_period_end')::boolean else cancel_at_period_end end,
    stripe_account_id      = case when p ? 'stripe_account_id' then p->>'stripe_account_id' else stripe_account_id end,
    charges_enabled        = case when p ? 'charges_enabled' then (p->>'charges_enabled')::boolean else charges_enabled end,
    updated_at = now()
  where salon_id = p_salon;
end $$;

create or replace function public.stripe_appointment_session(p_key text, p_appt uuid, p_session text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.stripe_check_key(p_key);
  update public.appointments set stripe_session_id = p_session where id = p_appt and payment_status = 'pending';
end $$;

-- Anzahlung bezahlt: Termin bestätigen, Daten für die Bestätigungsmails zurückgeben (null, wenn schon verarbeitet;
-- {conflict:true}, wenn die Zeit nach Ablauf der Reservierung vergeben wurde)
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
    -- zu spät bezahlt und die Zeit ist inzwischen vergeben: Aufrufer erstattet
    return jsonb_build_object('conflict', true);
  end;
  if not found then return null; end if;
  return (select jsonb_build_object('id', a.id, 'cancel_token', a.cancel_token, 'salon_slug', s.slug,
      'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email,
      'timezone', s.timezone, 'staff_name', st.name, 'service_name', a.service_name, 'price_cents', a.price_cents,
      'starts_at', lower(a.during), 'ends_at', upper(a.during), 'deposit_cents', a.deposit_cents,
      'customer', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'note', a.note))
    from public.salons s, public.staff st, public.customers c
    where s.id = a.salon_id and st.id = a.staff_id and c.id = a.customer_id);
end $$;

-- Zahlung abgebrochen oder Checkout abgelaufen: Reservierung freigeben
create or replace function public.stripe_appointment_release(p_key text, p_appt uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_session text;
begin
  perform public.stripe_check_key(p_key);
  update public.appointments set status = 'storniert', payment_status = 'expired'
   where id = p_appt and payment_status = 'pending'
  returning stripe_session_id into v_session;
  return v_session;
end $$;

-- Daten für die Erstattung bei Absage über den Link
create or replace function public.stripe_refund_info(p_key text, p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.stripe_check_key(p_key);
  return (select jsonb_build_object('id', a.id, 'payment_intent', a.stripe_payment_intent, 'account', b.stripe_account_id,
                 'refundable', a.payment_status = 'paid' and lower(a.during) > now() + interval '24 hours',
                 'session', a.stripe_session_id, 'pending', a.payment_status = 'pending')
          from public.appointments a join public.salon_billing b on b.salon_id = a.salon_id
          where a.cancel_token = p_token);
end $$;

create or replace function public.stripe_appointment_refunded(p_key text, p_appt uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.stripe_check_key(p_key);
  update public.appointments set payment_status = 'refunded' where id = p_appt and payment_status = 'paid';
end $$;

revoke all on function public.stripe_billing_get(text, uuid), public.stripe_billing_update(text, uuid, jsonb),
  public.stripe_appointment_session(text, uuid, text), public.stripe_appointment_paid(text, uuid, text),
  public.stripe_appointment_release(text, uuid), public.stripe_refund_info(text, uuid),
  public.stripe_appointment_refunded(text, uuid) from public;
grant execute on function public.stripe_billing_get(text, uuid), public.stripe_billing_update(text, uuid, jsonb),
  public.stripe_appointment_session(text, uuid, text), public.stripe_appointment_paid(text, uuid, text),
  public.stripe_appointment_release(text, uuid), public.stripe_refund_info(text, uuid),
  public.stripe_appointment_refunded(text, uuid) to anon, authenticated;

-- Schlüssel für die Stripe-Funktionen
insert into public.app_secrets (name, value) values ('stripe_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (name) do nothing;
