-- Boxentakt: Sperrzeiten je Platz (Wartung, Defekt …), einmalig (von–bis) oder wöchentlich wiederkehrend.
-- Ein gesperrter Platz wird bei der Platzvergabe übersprungen; die Buchungsseite sieht die Sperre als belegt.
create table public.resource_blocks (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons on delete cascade,
  resource_id uuid not null references public.resources on delete cascade,
  -- einmalig
  during tstzrange check (during is null or not isempty(during)),
  -- wöchentlich (0 = Sonntag … 6 = Samstag, Ortszeit des Betriebs)
  weekday int check (weekday between 0 and 6),
  starts time,
  ends time,
  reason text check (length(reason) <= 100),
  created_at timestamptz not null default now(),
  check ((during is not null and weekday is null and starts is null and ends is null)
      or (during is null and weekday is not null and starts is not null and ends is not null and starts < ends))
);
create index on public.resource_blocks (resource_id);
create index on public.resource_blocks (salon_id);
alter table public.resource_blocks enable row level security;
create policy resource_blocks_member on public.resource_blocks for all to authenticated
  using (public.is_member(salon_id)) with check (public.is_member(salon_id));

-- Sperren eines Betriebs als konkrete Zeiträume im Fenster [p_from, p_to) (max. 62 Tage)
create or replace function public.block_intervals(p_salon uuid, p_from timestamptz, p_to timestamptz)
returns table (block_id uuid, resource_id uuid, starts_at timestamptz, ends_at timestamptz, reason text)
language sql stable security definer set search_path = '' as $$
  with s as (select id, timezone from public.salons where id = p_salon),
       win as (select p_from as f, least(p_to, p_from + interval '62 days') as t)
  select b.id, b.resource_id, greatest(lower(b.during), win.f), least(upper(b.during), win.t), b.reason
    from public.resource_blocks b, s, win
   where b.salon_id = s.id and b.during && tstzrange(win.f, win.t)
  union all
  select b.id, b.resource_id, (d::date + b.starts) at time zone s.timezone, (d::date + b.ends) at time zone s.timezone, b.reason
    from public.resource_blocks b, s, win,
         generate_series((win.f at time zone s.timezone)::date, (win.t at time zone s.timezone)::date, interval '1 day') d
   where b.salon_id = s.id and b.weekday is not null and extract(dow from d) = b.weekday
     and tstzrange((d::date + b.starts) at time zone s.timezone, (d::date + b.ends) at time zone s.timezone) && tstzrange(win.f, win.t);
$$;
revoke all on function public.block_intervals(uuid, timestamptz, timestamptz) from public;

-- für das Dashboard (nur Mitglieder des Betriebs)
create or replace function public.blocked_resources(p_salon uuid, p_from timestamptz, p_to timestamptz)
returns table (block_id uuid, resource_id uuid, starts_at timestamptz, ends_at timestamptz, reason text)
language sql stable security definer set search_path = '' as $$
  select * from public.block_intervals(p_salon, p_from, p_to) where public.is_member(p_salon);
$$;
revoke all on function public.blocked_resources(uuid, timestamptz, timestamptz) from public;
grant execute on function public.blocked_resources(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.resource_blocked(p_resource uuid, p_range tstzrange) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.resources r
                 cross join lateral public.block_intervals(r.salon_id, lower(p_range) - interval '1 day', upper(p_range) + interval '1 day') bi
                 where r.id = p_resource and bi.resource_id = p_resource and tstzrange(bi.starts_at, bi.ends_at) && p_range);
$$;

-- Platzvergabe wie in 0027, gesperrte Plätze zählen als belegt
create or replace function public.appointments_pick_resources() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kinds text[]; k text; v_pick uuid; v_ids uuid[] := '{}'; v_explicit uuid; v_prev uuid[] := '{}'; v_planning text;
begin
  if tg_op = 'UPDATE' then
    v_prev := old.resource_ids;
    if new.resource_id is distinct from old.resource_id then v_explicit := new.resource_id; end if;
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

  if v_explicit is not null then
    if exists (select 1 from public.appointment_resources ar
                where ar.resource_id = v_explicit and ar.active and ar.appointment_id <> new.id and ar.during && new.during)
       or public.resource_blocked(v_explicit, new.during)
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
       and not public.resource_blocked(r.id, new.during)
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

-- Buchungsseite: Belegung = Termine + Sperren (ohne Grund)
create or replace function public.busy_resources(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (resource_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with s as (select id from public.salons where slug = p_slug),
       win as (select tstzrange(p_from, least(p_to, p_from + interval '62 days')) as r)
  select ar.resource_id, lower(ar.during), upper(ar.during)
  from public.appointment_resources ar join public.appointments a on a.id = ar.appointment_id, s, win
  where ar.salon_id = s.id and ar.active and ar.during && win.r
    and not coalesce(a.payment_status = 'pending' and a.payment_expires_at < now(), false)
  union all
  select bi.resource_id, bi.starts_at, bi.ends_at
  from s cross join lateral public.block_intervals(s.id, p_from, p_to) bi;
$$;
