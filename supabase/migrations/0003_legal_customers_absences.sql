-- Rechtliches: Angaben für Impressum/Datenschutz pro Salon
alter table public.salons
  add column legal_name text check (length(legal_name) <= 150),
  add column contact_email text check (length(contact_email) <= 200),
  add column vat_id text check (length(vat_id) <= 40),
  add column legal_extra text check (length(legal_extra) <= 1000);

-- Kundenkartei: Telefonnummer normalisiert (nur Ziffern, +49/0049 -> 0) zum Wiedererkennen
alter table public.customers
  add column phone_norm text generated always as (
    nullif(regexp_replace(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '^(00)?49', '0'), '')
  ) stored,
  add column note text check (length(note) <= 1000);
create index on public.customers (salon_id, phone_norm);

create view public.customer_stats with (security_invoker = true) as
select c.id as customer_id, c.salon_id,
  count(a.id) filter (where a.status <> 'storniert') as bookings,
  count(a.id) filter (where a.status = 'erschienen') as visits,
  count(a.id) filter (where a.status = 'nicht_erschienen') as no_shows,
  count(a.id) filter (where a.status = 'storniert') as cancellations,
  max(lower(a.during)) filter (where a.status in ('gebucht', 'erschienen') and lower(a.during) < now()) as last_visit,
  min(lower(a.during)) filter (where a.status = 'gebucht' and lower(a.during) >= now()) as next_visit,
  coalesce(sum(a.price_cents) filter (where a.status = 'erschienen'), 0) as revenue_cents
from public.customers c
left join public.appointments a on a.customer_id = c.id
group by c.id;

-- Abwesenheiten (Urlaub, Krankheit, Fortbildung); staff_id null = ganzer Salon
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons on delete cascade,
  staff_id uuid references public.staff on delete cascade,
  during tstzrange not null check (not isempty(during)),
  reason text check (length(reason) <= 200),
  created_at timestamptz not null default now()
);
create index on public.absences (salon_id, (lower(during)));
create index on public.absences (staff_id);
alter table public.absences enable row level security;
create policy absences_member on public.absences for all to authenticated
  using (public.is_member(salon_id)) with check (public.is_member(salon_id));

-- Belegte Zeiten inkl. Abwesenheiten (ohne Kundendaten)
create or replace function public.busy_intervals(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with s as (select id from public.salons where slug = p_slug),
       win as (select tstzrange(p_from, least(p_to, p_from + interval '62 days')) as r)
  select a.staff_id, lower(a.during), upper(a.during)
  from public.appointments a, s, win
  where a.salon_id = s.id and a.status <> 'storniert' and a.during && win.r
  union all
  select st.id, lower(ab.during), upper(ab.during)
  from public.absences ab
  join s on ab.salon_id = s.id
  join public.staff st on st.salon_id = s.id and (ab.staff_id is null or ab.staff_id = st.id)
  cross join win
  where ab.during && win.r;
$$;

-- Buchung: Abwesenheiten, Stammkunden, Missbrauchsgrenzen
create or replace function public.book_appointment(
  p_slug text, p_service uuid, p_staff uuid, p_start timestamptz,
  p_name text, p_phone text, p_email text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; sv public.services; v_local timestamp; v_end timestamptz; v_range tstzrange;
  v_staff uuid; v_staff_name text; v_customer uuid; v_appt public.appointments; v_phone_norm text;
begin
  select * into s from public.salons where slug = p_slug;
  if not found then raise exception 'salon_not_found'; end if;
  select * into sv from public.services where id = p_service and salon_id = s.id and active;
  if not found then raise exception 'service_not_found'; end if;

  p_name := btrim(coalesce(p_name, '')); p_phone := nullif(btrim(coalesce(p_phone, '')), '');
  p_email := nullif(lower(btrim(coalesce(p_email, ''))), ''); p_note := nullif(btrim(coalesce(p_note, '')), '');
  if length(p_name) < 2 or length(p_name) > 100 then raise exception 'invalid_name'; end if;
  if p_phone is null or length(regexp_replace(p_phone, '\D', '', 'g')) < 6 then raise exception 'invalid_phone'; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  v_phone_norm := nullif(regexp_replace(regexp_replace(p_phone, '\D', '', 'g'), '^(00)?49', '0'), '');

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
    insert into public.appointments (salon_id, staff_id, service_id, customer_id, service_name, price_cents, during, source, note)
    values (s.id, v_staff, sv.id, v_customer, sv.name, sv.price_cents, v_range, 'online', p_note)
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object('id', v_appt.id, 'cancel_token', v_appt.cancel_token,
    'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email,
    'timezone', s.timezone, 'staff_name', v_staff_name, 'service_name', sv.name,
    'price_cents', sv.price_cents, 'starts_at', p_start, 'ends_at', v_end);
end $$;

-- Öffentliche Salondaten inkl. Impressumsangaben
create or replace function public.public_salon(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name', s.name, 'address', s.address, 'phone', s.phone, 'notice', s.notice,
    'legal_name', s.legal_name, 'contact_email', s.contact_email, 'vat_id', s.vat_id, 'legal_extra', s.legal_extra,
    'timezone', s.timezone, 'slot_step', s.slot_step, 'booking_days', s.booking_days,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.sort, st.name)
                       from public.staff st where st.salon_id = s.id and st.active), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name,
                          'duration_min', sv.duration_min, 'price_cents', sv.price_cents) order by sv.sort, sv.name)
                       from public.services sv where sv.salon_id = s.id and sv.active), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                          'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday, h.opens)
                       from public.opening_hours h where h.salon_id = s.id), '[]'::jsonb))
  from public.salons s where s.slug = p_slug;
$$;
