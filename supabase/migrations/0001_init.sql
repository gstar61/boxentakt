-- Salonbuch: Grundschema
create extension if not exists btree_gist with schema extensions;

create table public.salons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null,
  address text,
  phone text,
  owner_email text not null,
  timezone text not null default 'Europe/Berlin',
  slot_step int not null default 15 check (slot_step in (5,10,15,20,30)),
  booking_days int not null default 28 check (booking_days between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.salon_members (
  salon_id uuid not null references public.salons on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner','staff')),
  primary key (salon_id, user_id)
);
create index on public.salon_members (user_id);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons on delete cascade,
  name text not null check (length(name) between 1 and 60),
  active boolean not null default true,
  sort int not null default 0
);
create index on public.staff (salon_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons on delete cascade,
  name text not null check (length(name) between 1 and 80),
  duration_min int not null check (duration_min between 5 and 600),
  price_cents int not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  sort int not null default 0
);
create index on public.services (salon_id);

-- weekday wie JavaScript getDay(): 0 = Sonntag ... 6 = Samstag. Kein Eintrag = geschlossen.
create table public.opening_hours (
  salon_id uuid not null references public.salons on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens time not null,
  closes time not null check (closes > opens),
  primary key (salon_id, weekday)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons on delete cascade,
  name text not null check (length(name) between 1 and 100),
  phone text check (length(phone) <= 40),
  email text check (length(email) <= 200),
  created_at timestamptz not null default now()
);
create index on public.customers (salon_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons on delete cascade,
  staff_id uuid not null references public.staff on delete restrict,
  service_id uuid references public.services on delete set null,
  customer_id uuid not null references public.customers on delete cascade,
  service_name text not null,
  price_cents int not null default 0,
  during tstzrange not null check (not isempty(during)),
  status text not null default 'gebucht'
    check (status in ('gebucht','erschienen','nicht_erschienen','storniert')),
  source text not null default 'online' check (source in ('online','salon')),
  note text check (length(note) <= 500),
  cancel_token uuid not null unique default gen_random_uuid(),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- keine zwei aktiven Termine einer Person gleichzeitig
  constraint no_double_booking exclude using gist (staff_id with =, during with &&)
    where (status <> 'storniert')
);
create index on public.appointments (salon_id, (lower(during)));
create index on public.appointments (staff_id);
create index on public.appointments (service_id);
create index on public.appointments (customer_id);

-- interne Schlüssel (z. B. für den Erinnerungs-Cron); ohne Policies = nur Security-Definer-Funktionen
create table public.app_secrets (name text primary key, value text not null);

-------------------------------------------------------------------------------
-- RLS: Mitglieder eines Salons verwalten alles in ihrem Salon. Öffentlich nur über RPCs.
-------------------------------------------------------------------------------
create or replace function public.is_member(p_salon uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.salon_members m
                 where m.salon_id = p_salon and m.user_id = (select auth.uid()));
$$;
revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

alter table public.salons enable row level security;
alter table public.salon_members enable row level security;
alter table public.staff enable row level security;
alter table public.services enable row level security;
alter table public.opening_hours enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.app_secrets enable row level security;

create policy salons_member_read on public.salons for select to authenticated using (public.is_member(id));
create policy salons_member_update on public.salons for update to authenticated using (public.is_member(id)) with check (public.is_member(id));
create policy members_own on public.salon_members for select to authenticated using (user_id = (select auth.uid()));

create policy staff_member on public.staff for all to authenticated using (public.is_member(salon_id)) with check (public.is_member(salon_id));
create policy services_member on public.services for all to authenticated using (public.is_member(salon_id)) with check (public.is_member(salon_id));
create policy hours_member on public.opening_hours for all to authenticated using (public.is_member(salon_id)) with check (public.is_member(salon_id));
create policy customers_member on public.customers for all to authenticated using (public.is_member(salon_id)) with check (public.is_member(salon_id));
create policy appointments_member on public.appointments for all to authenticated using (public.is_member(salon_id)) with check (public.is_member(salon_id));

-------------------------------------------------------------------------------
-- Inhaber verknüpfen: wer sich mit der owner_email anmeldet, wird Mitglied
-------------------------------------------------------------------------------
create or replace function public.claim_salons()
returns int language plpgsql security definer set search_path = '' as $$
declare v_email text; v_n int;
begin
  select lower(u.email) into v_email from auth.users u
   where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  insert into public.salon_members (salon_id, user_id, role)
  select s.id, (select auth.uid()), 'owner' from public.salons s
   where lower(s.owner_email) = v_email
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.claim_salons() from public, anon;
grant execute on function public.claim_salons() to authenticated;

-------------------------------------------------------------------------------
-- Öffentliche Funktionen für die Buchungsseite (keine Kundendaten nach außen)
-------------------------------------------------------------------------------
create or replace function public.public_salon(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name', s.name, 'address', s.address, 'phone', s.phone,
    'timezone', s.timezone, 'slot_step', s.slot_step, 'booking_days', s.booking_days,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.sort, st.name)
                       from public.staff st where st.salon_id = s.id and st.active), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name,
                          'duration_min', sv.duration_min, 'price_cents', sv.price_cents) order by sv.sort, sv.name)
                       from public.services sv where sv.salon_id = s.id and sv.active), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                          'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday)
                       from public.opening_hours h where h.salon_id = s.id), '[]'::jsonb))
  from public.salons s where s.slug = p_slug;
$$;

create or replace function public.busy_intervals(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.staff_id, lower(a.during), upper(a.during)
  from public.appointments a join public.salons s on s.id = a.salon_id
  where s.slug = p_slug and a.status <> 'storniert'
    and a.during && tstzrange(p_from, least(p_to, p_from + interval '62 days'));
$$;

create or replace function public.book_appointment(
  p_slug text, p_service uuid, p_staff uuid, p_start timestamptz,
  p_name text, p_phone text, p_email text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; sv public.services; v_local timestamp; v_end timestamptz;
  v_staff uuid; v_staff_name text; v_customer uuid; v_appt public.appointments;
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

  if p_start < now() + interval '15 minutes' or p_start > now() + make_interval(days => s.booking_days)
    then raise exception 'outside_window'; end if;
  v_local := p_start at time zone s.timezone;
  if (extract(epoch from v_local::time)::int / 60) % s.slot_step <> 0 then raise exception 'invalid_time'; end if;
  v_end := p_start + make_interval(mins => sv.duration_min);
  if not exists (select 1 from public.opening_hours h
                 where h.salon_id = s.id and h.weekday = extract(dow from v_local)
                   and v_local::time >= h.opens
                   and (v_end at time zone s.timezone) <= v_local::date + h.closes)
    then raise exception 'closed'; end if;

  -- Person wählen: gewünschte, sonst die erste freie
  select st.id, st.name into v_staff, v_staff_name from public.staff st
   where st.salon_id = s.id and st.active and (p_staff is null or st.id = p_staff)
     and not exists (select 1 from public.appointments a where a.staff_id = st.id and a.status <> 'storniert'
                     and a.during && tstzrange(p_start, v_end))
   order by st.sort, st.name limit 1;
  if v_staff is null then raise exception 'slot_taken'; end if;

  insert into public.customers (salon_id, name, phone, email)
  values (s.id, p_name, p_phone, p_email) returning id into v_customer;

  begin
    insert into public.appointments (salon_id, staff_id, service_id, customer_id, service_name, price_cents, during, source, note)
    values (s.id, v_staff, sv.id, v_customer, sv.name, sv.price_cents, tstzrange(p_start, v_end), 'online', p_note)
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object('id', v_appt.id, 'cancel_token', v_appt.cancel_token,
    'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email,
    'timezone', s.timezone, 'staff_name', v_staff_name, 'service_name', sv.name,
    'price_cents', sv.price_cents, 'starts_at', p_start, 'ends_at', v_end);
end $$;

create or replace function public.appointment_by_token(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', a.status, 'service_name', a.service_name, 'price_cents', a.price_cents,
    'starts_at', lower(a.during), 'ends_at', upper(a.during), 'staff_name', st.name,
    'salon_name', s.name, 'salon_slug', s.slug, 'salon_phone', s.phone, 'timezone', s.timezone,
    'can_cancel', a.status = 'gebucht' and lower(a.during) > now() + interval '2 hours')
  from public.appointments a join public.salons s on s.id = a.salon_id join public.staff st on st.id = a.staff_id
  where a.cancel_token = p_token;
$$;

create or replace function public.cancel_by_token(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.appointments set status = 'storniert'
   where cancel_token = p_token and status = 'gebucht' and lower(during) > now() + interval '2 hours';
  return found;
end $$;

-- Erinnerungen: gibt Termine von morgen (Salon-Zeitzone) mit E-Mail zurück und markiert sie als versendet
create or replace function public.take_due_reminders(p_key text)
returns table (email text, customer_name text, service_name text, starts_at timestamptz,
               staff_name text, salon_name text, salon_phone text, timezone text, cancel_token uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where name = 'cron_key' and value = p_key) then
    raise exception 'forbidden';
  end if;
  return query
  with due as (
    update public.appointments a set reminder_sent_at = now()
    from public.salons s, public.customers c
    where s.id = a.salon_id and c.id = a.customer_id
      and a.status = 'gebucht' and a.reminder_sent_at is null and c.email is not null
      and (lower(a.during) at time zone s.timezone)::date = ((now() at time zone s.timezone)::date + 1)
    returning a.id
  )
  select c.email, c.name, a.service_name, lower(a.during), st.name, s.name, s.phone, s.timezone, a.cancel_token
  from due join public.appointments a on a.id = due.id
  join public.salons s on s.id = a.salon_id join public.customers c on c.id = a.customer_id
  join public.staff st on st.id = a.staff_id;
end $$;

revoke all on function public.public_salon(text), public.busy_intervals(text, timestamptz, timestamptz),
  public.book_appointment(text, uuid, uuid, timestamptz, text, text, text, text),
  public.appointment_by_token(uuid), public.cancel_by_token(uuid), public.take_due_reminders(text) from public;
grant execute on function public.public_salon(text), public.busy_intervals(text, timestamptz, timestamptz),
  public.book_appointment(text, uuid, uuid, timestamptz, text, text, text, text),
  public.appointment_by_token(uuid), public.cancel_by_token(uuid), public.take_due_reminders(text) to anon, authenticated;
