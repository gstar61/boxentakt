-- Team-Einladungen: wer sich mit dieser E-Mail anmeldet, wird Mitglied
create table public.salon_invites (
  salon_id uuid not null references public.salons on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (salon_id, email)
);

-- Mitglieder können deaktiviert werden (statt Zeilen zu löschen)
alter table public.salon_members add column active boolean not null default true;
create or replace function public.is_member(p_salon uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.salon_members m
                 where m.salon_id = p_salon and m.user_id = (select auth.uid()) and m.active);
$$;
alter table public.salon_invites enable row level security;
create policy invites_member on public.salon_invites for all to authenticated
  using (public.is_member(salon_id)) with check (public.is_member(salon_id));

-- Inhaber (owner_email) und Einladungen beim Login übernehmen
create or replace function public.claim_salons()
returns int language plpgsql security definer set search_path = '' as $$
declare v_email text; v_uid uuid := (select auth.uid()); v_n int; v_m int;
begin
  select lower(u.email) into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  insert into public.salon_members (salon_id, user_id, role)
  select s.id, v_uid, 'owner' from public.salons s where lower(s.owner_email) = v_email
  on conflict do nothing;
  get diagnostics v_n = row_count;
  insert into public.salon_members (salon_id, user_id, role)
  select i.salon_id, v_uid, i.role from public.salon_invites i where i.email = v_email and i.accepted_at is null
  on conflict (salon_id, user_id) do update set active = true, role = excluded.role;
  get diagnostics v_m = row_count;
  update public.salon_invites set accepted_at = now() where email = v_email and accepted_at is null;
  return v_n + v_m;
end $$;

-- Ist eine Salon-Adresse noch frei? (für die Registrierung)
create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_slug ~ '^[a-z0-9-]{3,40}$'
     and p_slug not in ('api', 'dashboard', 'login', 'registrieren', 'storno', 'impressum', 'datenschutz', 'admin', 'www')
     and not exists (select 1 from public.salons where slug = p_slug);
$$;

-- Neuen Salon für den angemeldeten Nutzer anlegen, mit Startwerten
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
  insert into public.staff (salon_id, name, sort) values (v_salon, coalesce(nullif(p_staff_name, ''), 'Team'), 1);
  insert into public.opening_hours (salon_id, weekday, opens, closes)
  select v_salon, d, '09:00', case when d = 6 then '14:00'::time else '18:00'::time end from generate_series(2, 6) d;
  insert into public.services (salon_id, name, duration_min, price_cents, sort) values
    (v_salon, 'Damen · Waschen, Schneiden, Föhnen', 60, 5500, 1),
    (v_salon, 'Herren · Schneiden', 30, 2800, 2),
    (v_salon, 'Kinderschnitt', 30, 1800, 3),
    (v_salon, 'Ansatzfarbe inkl. Föhnen', 90, 7000, 4);
  return p_slug;
end $$;

-- Team eines Salons (Mitglieder mit E-Mail + offene Einladungen), nur für Mitglieder
create or replace function public.salon_team(p_salon uuid)
returns table (kind text, user_id uuid, email text, role text)
language sql stable security definer set search_path = '' as $$
  select 'member', m.user_id, u.email::text, m.role
  from public.salon_members m join auth.users u on u.id = m.user_id
  where m.salon_id = p_salon and m.active and public.is_member(p_salon)
  union all
  select 'invite', null, i.email, i.role
  from public.salon_invites i
  where i.salon_id = p_salon and i.accepted_at is null and public.is_member(p_salon);
$$;

-- Mitglied deaktivieren (nur Inhaber; der letzte Inhaber bleibt)
create or replace function public.remove_member(p_salon uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.salon_members where salon_id = p_salon and user_id = (select auth.uid()) and role = 'owner' and active) then
    raise exception 'forbidden';
  end if;
  if (select role from public.salon_members where salon_id = p_salon and user_id = p_user) = 'owner'
     and (select count(*) from public.salon_members where salon_id = p_salon and role = 'owner' and active) <= 1 then
    raise exception 'last_owner';
  end if;
  update public.salon_members set active = false where salon_id = p_salon and user_id = p_user;
  return found;
end $$;

revoke all on function public.slug_available(text), public.create_salon(text, text, text),
  public.salon_team(uuid), public.remove_member(uuid, uuid) from public;
grant execute on function public.slug_available(text) to anon, authenticated;
grant execute on function public.create_salon(text, text, text), public.salon_team(uuid), public.remove_member(uuid, uuid) to authenticated;
