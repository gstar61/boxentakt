-- Boxentakt: mehrere Plätze pro Termin und Planungsart je Betrieb.
-- * services.resource_kinds: eine Leistung kann mehrere Platz-Arten brauchen (z. B. Hebebühne + Wuchtmaschine).
-- * appointment_resources: je belegtem Platz eine Zeile; die Doppelbelegung sperrt die Datenbank dort.
-- * Die Plätze vergibt ein Trigger auf appointments (Online-Buchung, Dashboard, Verschieben): je Art ein freier
--   Platz, beim Verschieben bevorzugt derselbe. Hat der Betrieb keinen aktiven Platz einer Art, wird sie ignoriert.
-- * salons.planning: 'plaetze' (Standard) = nur die Plätze zählen, Mitarbeiter dürfen sich überschneiden;
--   'mitarbeiter' = zusätzlich muss ein Mitarbeiter frei sein (wie bisher).
--   Brauchen die gebuchten Leistungen keinen vorhandenen Platz, zählen immer die Mitarbeiter.

alter table public.salons
  add column planning text not null default 'plaetze' check (planning in ('plaetze', 'mitarbeiter'));

alter table public.services
  add column resource_kinds text[] not null default '{}'
    check (resource_kinds <@ array['buehne', 'wuchtmaschine', 'sonstige']::text[]);
update public.services set resource_kinds = array[resource_kind] where resource_kind is not null;

alter table public.appointments
  add column resource_ids uuid[] not null default '{}',
  add column staff_exclusive boolean not null default true;
update public.appointments set resource_ids = array[resource_id] where resource_id is not null;

-- Mitarbeiter-Überschneidung nur sperren, wenn der Termin nach Mitarbeitern geplant ist
alter table public.appointments drop constraint no_double_booking;
alter table public.appointments add constraint no_double_booking exclude using gist (staff_id with =, during with &&)
  where (status <> 'storniert' and staff_exclusive);
alter table public.appointments drop constraint no_resource_double_booking;

create table public.appointment_resources (
  appointment_id uuid not null references public.appointments on delete cascade,
  resource_id uuid not null references public.resources on delete cascade,
  salon_id uuid not null references public.salons on delete cascade,
  during tstzrange not null,
  active boolean not null default true,
  primary key (appointment_id, resource_id),
  constraint no_resource_double_booking exclude using gist (resource_id with =, during with &&) where (active)
);
create index on public.appointment_resources (salon_id, (lower(during)));
alter table public.appointment_resources enable row level security;
-- lesen dürfen Mitglieder; geschrieben wird nur über den Trigger
create policy appointment_resources_read on public.appointment_resources for select to authenticated
  using (public.is_member(salon_id));

insert into public.appointment_resources (appointment_id, resource_id, salon_id, during, active)
select a.id, a.resource_id, a.salon_id, a.during, a.status <> 'storniert'
  from public.appointments a where a.resource_id is not null;

create or replace function public.resource_rank(p_kind text) returns int
language sql immutable set search_path = '' as $$
  select case p_kind when 'buehne' then 1 when 'wuchtmaschine' then 2 else 3 end;
$$;

-- Vor dem Speichern: Plätze wählen (je benötigter Art einer), Hauptplatz und Planungsart setzen
create or replace function public.appointments_pick_resources() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kinds text[]; k text; v_pick uuid; v_ids uuid[] := '{}'; v_explicit uuid; v_prev uuid[] := '{}'; v_planning text;
begin
  if tg_op = 'UPDATE' then
    v_prev := old.resource_ids;
    if new.resource_id is distinct from old.resource_id then v_explicit := new.resource_id; end if;
    -- nur neu vergeben, wenn sich Zeit, Leistungen oder Platz geändert haben oder ein Storno aufgehoben wird
    if new.during = old.during and new.service_ids is not distinct from old.service_ids
       and new.service_id is not distinct from old.service_id and v_explicit is null
       and not (old.status = 'storniert' and new.status <> 'storniert') then
      return new;
    end if;
  else
    v_explicit := new.resource_id;
  end if;
  if new.status = 'storniert' then return new; end if;

  select coalesce(array_agg(distinct x), '{}') into v_kinds
    from public.services sv cross join lateral unnest(sv.resource_kinds) x
   where sv.id = any(coalesce(new.service_ids, array[new.service_id]));

  -- im Dashboard ausdrücklich gewählter Platz: muss frei sein, deckt seine Art ab
  if v_explicit is not null then
    if exists (select 1 from public.appointment_resources ar
                where ar.resource_id = v_explicit and ar.active and ar.appointment_id <> new.id and ar.during && new.during)
      then raise exception using errcode = '23P01', message = 'no_resource_double_booking'; end if;
    v_ids := array[v_explicit];
    v_kinds := array_remove(v_kinds, (select r.kind from public.resources r where r.id = v_explicit));
  end if;

  foreach k in array v_kinds loop
    continue when not exists (select 1 from public.resources r where r.salon_id = new.salon_id and r.kind = k and r.active);
    v_pick := null;
    select r.id into v_pick from public.resources r
     where r.salon_id = new.salon_id and r.kind = k and r.active
       and not exists (select 1 from public.appointment_resources ar
                        where ar.resource_id = r.id and ar.active and ar.appointment_id <> new.id and ar.during && new.during)
     order by (r.id = any(v_prev)) desc, r.sort, r.name limit 1;
    if v_pick is null then raise exception using errcode = '23P01', message = 'no_resource_double_booking'; end if;
    v_ids := v_ids || v_pick;
  end loop;

  new.resource_ids := v_ids;
  new.resource_id := (select r.id from public.resources r where r.id = any(v_ids)
                       order by public.resource_rank(r.kind), r.sort, r.name limit 1);
  select s.planning into v_planning from public.salons s where s.id = new.salon_id;
  new.staff_exclusive := not (v_planning = 'plaetze' and cardinality(v_ids) > 0);
  return new;
end $$;

-- Nach dem Speichern: Belegungstabelle nachziehen (hier greift die Sperre gegen Doppelbelegung)
create or replace function public.appointments_sync_resources() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.appointment_resources where appointment_id = new.id and resource_id <> all(new.resource_ids);
  insert into public.appointment_resources (appointment_id, resource_id, salon_id, during, active)
  select new.id, x, new.salon_id, new.during, new.status <> 'storniert' from unnest(new.resource_ids) x
  on conflict (appointment_id, resource_id) do update set during = excluded.during, active = excluded.active;
  return null;
end $$;

create trigger appointments_pick_resources before insert or update on public.appointments
  for each row execute function public.appointments_pick_resources();
-- ohne Spaltenliste: der Before-Trigger ändert resource_ids auch, wenn das UPDATE sie nicht nennt
create trigger appointments_sync_resources after insert or update on public.appointments
  for each row execute function public.appointments_sync_resources();

-- Belegte Plätze für die Buchungsseite
create or replace function public.busy_resources(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (resource_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with s as (select id from public.salons where slug = p_slug),
       win as (select tstzrange(p_from, least(p_to, p_from + interval '62 days')) as r)
  select ar.resource_id, lower(ar.during), upper(ar.during)
  from public.appointment_resources ar join public.appointments a on a.id = ar.appointment_id, s, win
  where ar.salon_id = s.id and ar.active and ar.during && win.r
    and not coalesce(a.payment_status = 'pending' and a.payment_expires_at < now(), false);
$$;

-- Buchungsseite: Planungsart und Platz-Arten je Leistung mitliefern
create or replace function public.public_salon(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name', s.name, 'address', s.address, 'phone', s.phone, 'notice', s.notice,
    'legal_name', s.legal_name, 'contact_email', s.contact_email, 'vat_id', s.vat_id, 'legal_extra', s.legal_extra,
    'timezone', s.timezone, 'slot_step', s.slot_step, 'booking_days', s.booking_days,
    'logo_url', s.logo_url, 'cover_url', s.cover_url, 'class_extra', s.class_extra, 'planning', s.planning,
    'bookable', public.salon_bookable(s.id),
    'deposit_percent', case when coalesce(b.charges_enabled, false) then s.deposit_percent else 0 end,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.sort, st.name)
                       from public.staff st where st.salon_id = s.id and st.active), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name,
                          'duration_min', sv.duration_min, 'price_cents', sv.price_cents, 'resource_kinds', sv.resource_kinds,
                          'staff_prices', coalesce((select jsonb_object_agg(sp.staff_id, sp.price_cents)
                                                    from public.staff_prices sp join public.staff st on st.id = sp.staff_id and st.active
                                                    where sp.service_id = sv.id), '{}'::jsonb)) order by sv.sort, sv.name)
                       from public.services sv where sv.salon_id = s.id and sv.active), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'name', r.name) order by r.sort, r.name)
                           from public.resources r where r.salon_id = s.id and r.active), '[]'::jsonb),
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

-- true, wenn die Leistungen mindestens einen vorhandenen aktiven Platz brauchen und nach Plätzen geplant wird
create or replace function public.plans_by_place(p_salon uuid, p_services uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.planning = 'plaetze' from public.salons s where s.id = p_salon), false)
     and exists (select 1 from public.services sv cross join lateral unnest(sv.resource_kinds) k(kind)
                 join public.resources r on r.salon_id = p_salon and r.kind = k.kind and r.active
                 where sv.id = any(p_services));
$$;

create or replace function public.book_services(p_slug text, p_services uuid[], p_staff uuid, p_start timestamptz, p_name text, p_phone text, p_email text, p_note text,
  p_plate text default null, p_class text default 'pkw', p_vehicle text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; b public.salon_billing; v_local timestamp; v_end timestamptz; v_range tstzrange; v_minutes int; v_names text;
  v_staff uuid; v_staff_name text; v_customer uuid; v_appt public.appointments; v_phone_norm text; v_deposit int; v_price int;
  v_extra_min int := 0; v_extra_cents int := 0; v_by_place boolean;
begin
  select * into s from public.salons where slug = p_slug;
  if not found then raise exception 'salon_not_found'; end if;
  if not public.salon_bookable(s.id) then raise exception 'not_bookable'; end if;
  if p_services is null or cardinality(p_services) = 0 or cardinality(p_services) > 4
     or cardinality(p_services) <> (select count(distinct x) from unnest(p_services) x) then raise exception 'service_not_found'; end if;
  if (select count(*) from public.services where id = any(p_services) and salon_id = s.id and active) <> cardinality(p_services)
    then raise exception 'service_not_found'; end if;
  select sum(sv.duration_min), string_agg(sv.name, ' + ' order by o.n)
    into v_minutes, v_names
    from unnest(p_services) with ordinality o(id, n) join public.services sv on sv.id = o.id;
  select * into b from public.salon_billing where salon_id = s.id;

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

  -- Mitarbeiter: nach Plätzen geplant -> bevorzugt ein freier, sonst der erste; sonst muss einer frei sein
  v_by_place := public.plans_by_place(s.id, p_services);
  select st.id, st.name into v_staff, v_staff_name from public.staff st
   where st.salon_id = s.id and st.active and (p_staff is null or st.id = p_staff)
     and (v_by_place or (
          not exists (select 1 from public.appointments a where a.staff_id = st.id and a.status <> 'storniert' and a.during && v_range)
      and not exists (select 1 from public.absences ab where ab.salon_id = s.id
                      and (ab.staff_id is null or ab.staff_id = st.id) and ab.during && v_range)))
   order by (exists (select 1 from public.appointments a where a.staff_id = st.id and a.status <> 'storniert' and a.during && v_range)
             or exists (select 1 from public.absences ab where ab.salon_id = s.id
                        and (ab.staff_id is null or ab.staff_id = st.id) and ab.during && v_range)),
            st.sort, st.name
   limit 1;
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

  -- Plätze vergibt der Trigger; ist keiner frei, kommt exclusion_violation
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

create or replace function public.reschedule_by_token(p_token uuid, p_start timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.appointments; s public.salons; v_local timestamp; v_end timestamptz; v_range tstzrange; v_old timestamptz;
        v_staff_name text; c public.customers;
begin
  select * into a from public.appointments where cancel_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if a.status <> 'gebucht' or coalesce(a.payment_status, '') = 'pending' or lower(a.during) <= now() + interval '2 hours'
    then raise exception 'too_late'; end if;
  if a.reschedule_count >= 3 then raise exception 'too_often'; end if;
  select * into s from public.salons where id = a.salon_id;
  if not public.salon_bookable(s.id) then raise exception 'not_bookable'; end if;
  select name into v_staff_name from public.staff where id = a.staff_id and active;
  if not found then raise exception 'slot_taken'; end if;

  if p_start < now() + interval '15 minutes' or p_start > now() + make_interval(days => s.booking_days)
    then raise exception 'outside_window'; end if;
  v_local := p_start at time zone s.timezone;
  if (extract(epoch from v_local::time)::int / 60) % s.slot_step <> 0 then raise exception 'invalid_time'; end if;
  v_old := lower(a.during);
  v_end := p_start + (upper(a.during) - lower(a.during));
  v_range := tstzrange(p_start, v_end);
  if not exists (select 1 from public.day_intervals(s.id, v_local::date) h
                 where v_local::time >= h.opens and (v_end at time zone s.timezone) <= v_local::date + h.closes)
    then raise exception 'closed'; end if;

  perform public.release_expired_holds();
  -- nach Mitarbeitern geplant: Abwesenheit der Person sperrt (Überschneidung sperrt der Constraint)
  if a.staff_exclusive and exists (select 1 from public.absences ab where ab.salon_id = s.id
             and (ab.staff_id is null or ab.staff_id = a.staff_id) and ab.during && v_range)
    then raise exception 'slot_taken'; end if;

  -- Plätze nimmt der Trigger mit (derselbe, sonst ein anderer freier der gleichen Art)
  begin
    update public.appointments set during = v_range, reschedule_count = reschedule_count + 1, reminder_sent_at = null
     where id = a.id;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  select * into c from public.customers where id = a.customer_id;
  return jsonb_build_object('cancel_token', a.cancel_token, 'old_start', v_old, 'starts_at', p_start, 'ends_at', v_end,
    'service_name', a.service_name, 'staff_name', v_staff_name, 'customer_name', c.name, 'customer_email', c.email,
    'customer_phone', c.phone, 'salon_name', s.name, 'salon_slug', s.slug, 'salon_phone', s.phone, 'salon_logo', s.logo_url,
    'owner_email', s.owner_email, 'timezone', s.timezone);
end $$;

-- Termin per Token: Plätze mitliefern (für das Verschieben)
create or replace function public.appointment_by_token(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', a.status, 'service_name', a.service_name, 'price_cents', a.price_cents,
    'starts_at', lower(a.during), 'ends_at', upper(a.during), 'staff_name', st.name, 'staff_id', st.id, 'resource_id', a.resource_id,
    'resource_ids', a.resource_ids, 'staff_exclusive', a.staff_exclusive,
    'duration_min', (extract(epoch from upper(a.during) - lower(a.during)) / 60)::int,
    'salon_name', s.name, 'salon_slug', s.slug, 'salon_phone', s.phone, 'timezone', s.timezone,
    'deposit_cents', a.deposit_cents, 'payment_status', a.payment_status,
    'deposit_refundable', a.payment_status = 'paid' and lower(a.during) > now() + interval '24 hours',
    'can_cancel', a.status = 'gebucht' and coalesce(a.payment_status, '') <> 'pending' and lower(a.during) > now() + interval '2 hours',
    'can_move', a.status = 'gebucht' and coalesce(a.payment_status, '') <> 'pending' and lower(a.during) > now() + interval '2 hours'
                and a.reschedule_count < 3 and st.active and public.salon_bookable(s.id))
  from public.appointments a join public.salons s on s.id = a.salon_id join public.staff st on st.id = a.staff_id
  where a.cancel_token = p_token;
$$;

-- Startkatalog mit Platz-Arten
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
  insert into public.resources (salon_id, name, kind, sort) values (v_salon, 'Hebebühne 1', 'buehne', 1);
  insert into public.services (salon_id, name, duration_min, price_cents, sort, resource_kinds) values
    (v_salon, 'Räderwechsel (Sommer/Winter)', 45, 4900, 1, '{buehne}'),
    (v_salon, 'Räderwechsel mit Einlagerung', 45, 5900, 2, '{buehne}'),
    (v_salon, 'Ölwechsel inkl. Filter', 60, 8900, 3, '{buehne}'),
    (v_salon, 'Inspektion', 120, 14900, 4, '{buehne}'),
    (v_salon, 'HU/AU', 60, 12900, 5, '{}'),
    (v_salon, 'Bremsencheck', 30, 0, 6, '{buehne}'),
    (v_salon, 'Achsvermessung', 60, 8900, 7, '{}');
  return p_slug;
end $$;

-- alte Einzel-Spalte wird nicht mehr genutzt
alter table public.services drop column resource_kind;
