-- Warteliste: Kundin trägt sich für einen ausgebuchten Tag ein; wird an dem Tag ein Termin abgesagt, bekommt sie eine Mail.
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  staff_id uuid references public.staff (id) on delete set null,
  day date not null,
  name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create index waitlist_salon_day_idx on public.waitlist (salon_id, day);
alter table public.waitlist enable row level security;
create policy waitlist_member_read on public.waitlist for select to authenticated using (public.is_member(salon_id));
create policy waitlist_member_delete on public.waitlist for delete to authenticated using (public.is_member(salon_id));

create or replace function public.join_waitlist(p_slug text, p_service uuid, p_staff uuid, p_day date, p_name text, p_email text, p_phone text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.salons;
begin
  select * into s from public.salons where slug = p_slug;
  if not found then raise exception 'salon_not_found'; end if;
  if not public.salon_bookable(s.id) then raise exception 'not_bookable'; end if;
  p_name := btrim(coalesce(p_name, '')); p_email := lower(btrim(coalesce(p_email, ''))); p_phone := nullif(btrim(coalesce(p_phone, '')), '');
  if length(p_name) < 2 or length(p_name) > 100 then raise exception 'invalid_name'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if p_day < (now() at time zone s.timezone)::date or p_day > (now() at time zone s.timezone)::date + s.booking_days then raise exception 'outside_window'; end if;
  if p_service is not null and not exists (select 1 from public.services where id = p_service and salon_id = s.id and active) then raise exception 'service_not_found'; end if;
  if p_staff is not null and not exists (select 1 from public.staff where id = p_staff and salon_id = s.id and active) then p_staff := null; end if;
  -- Missbrauchsgrenzen: höchstens 3 offene Einträge je E-Mail und Salon, 30 neue je Salon und Stunde
  if (select count(*) from public.waitlist w where w.salon_id = s.id and w.email = p_email and w.notified_at is null and w.day >= current_date) >= 3
    then raise exception 'too_many'; end if;
  if (select count(*) from public.waitlist w where w.salon_id = s.id and w.created_at > now() - interval '1 hour') >= 30
    then raise exception 'rate_limited'; end if;
  if exists (select 1 from public.waitlist w where w.salon_id = s.id and w.email = p_email and w.day = p_day and w.notified_at is null) then return true; end if;
  insert into public.waitlist (salon_id, service_id, staff_id, day, name, email, phone) values (s.id, p_service, p_staff, p_day, p_name, p_email, p_phone);
  return true;
end $$;

-- Nach einer Absage: offene Einträge für den Tag des Termins holen und als benachrichtigt markieren (Server mit Cron-Key)
create or replace function public.take_waitlist(p_key text, p_appt uuid)
returns table (email text, name text, day date, salon_name text, salon_slug text, salon_phone text, reply_to text, service_id uuid, service_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where app_secrets.name = 'cron_key' and value = p_key) then
    raise exception 'forbidden';
  end if;
  return query
  with appt as (
    select a.salon_id, (lower(a.during) at time zone s.timezone)::date as d, s.timezone
    from public.appointments a join public.salons s on s.id = a.salon_id
    where a.id = p_appt and a.status = 'storniert' and lower(a.during) > now()
  ),
  hit as (
    update public.waitlist w set notified_at = now()
    from appt where w.salon_id = appt.salon_id and w.day = appt.d and w.notified_at is null
    returning w.*
  )
  select h.email, h.name, h.day, s.name, s.slug, s.phone, coalesce(s.contact_email, s.owner_email), h.service_id, sv.name
  from hit h join public.salons s on s.id = h.salon_id left join public.services sv on sv.id = h.service_id;
end $$;

revoke all on function public.join_waitlist(text, uuid, uuid, date, text, text, text), public.take_waitlist(text, uuid) from public;
grant execute on function public.join_waitlist(text, uuid, uuid, date, text, text, text), public.take_waitlist(text, uuid) to anon, authenticated;

-- Variante für die Absage über den Kunden-Link (dort ist nur der Token bekannt)
create or replace function public.take_waitlist_by_token(p_key text, p_token uuid)
returns table (email text, name text, day date, salon_name text, salon_slug text, salon_phone text, reply_to text, service_id uuid, service_name text)
language sql security definer set search_path = '' as $$
  select * from public.take_waitlist(p_key, (select a.id from public.appointments a where a.cancel_token = p_token));
$$;
revoke all on function public.take_waitlist_by_token(text, uuid) from public;
grant execute on function public.take_waitlist_by_token(text, uuid) to anon, authenticated;
