-- Schnittstelle zu RadsatzPro: Verbindung je Betrieb und Ausgangswarteschlange für Termin-Ereignisse.
-- Jede Buchung, Änderung und Absage landet als Ereignis in integration_events; die App liefert sie
-- per HTTPS an RadsatzPro aus (mit Wiederholung) und fragt dort Radsätze zum Kennzeichen ab.
create table public.salon_integrations (
  salon_id uuid primary key references public.salons on delete cascade,
  provider text not null default 'radsatzpro' check (provider = 'radsatzpro'),
  -- nur https mit Domainname (keine IP-Adressen), zum Entwickeln auch http://localhost
  base_url text not null check (
    length(base_url) <= 200 and (
      (base_url ~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{2,5})?$' and base_url !~ '^https://[0-9.]+(:|$)')
      or base_url ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{2,5})?$')),
  api_key text not null check (length(api_key) between 16 and 200),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.salon_integrations enable row level security;
create policy salon_integrations_owner on public.salon_integrations for all to authenticated
  using (exists (select 1 from public.salon_members m where m.salon_id = salon_integrations.salon_id and m.user_id = (select auth.uid()) and m.role = 'owner' and m.active))
  with check (exists (select 1 from public.salon_members m where m.salon_id = salon_integrations.salon_id and m.user_id = (select auth.uid()) and m.role = 'owner' and m.active));

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons on delete cascade,
  appointment_id uuid,
  kind text not null check (kind in ('appointment.created', 'appointment.updated', 'appointment.cancelled')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts int not null default 0,
  next_try_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.integration_events (status, next_try_at);
create index on public.integration_events (salon_id, created_at desc);
alter table public.integration_events enable row level security;
create policy integration_events_owner on public.integration_events for select to authenticated
  using (exists (select 1 from public.salon_members m where m.salon_id = integration_events.salon_id and m.user_id = (select auth.uid()) and m.role = 'owner' and m.active));

-- Ereignis anlegen, sobald sich an einem Termin etwas Relevantes ändert (nur bei aktiver Verbindung)
create function public.queue_integration_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_cust public.customers; v_place text;
begin
  if not exists (select 1 from public.salon_integrations i where i.salon_id = new.salon_id and i.enabled) then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.payment_status, '') = 'pending' then return new; end if; -- Anzahlung offen: noch nicht melden
    v_kind := 'appointment.created';
  elsif coalesce(old.payment_status, '') in ('pending', 'expired') and new.payment_status = 'paid' then
    v_kind := 'appointment.created';
  elsif new.status = 'storniert' and old.status <> 'storniert' then
    if coalesce(old.payment_status, '') = 'pending' then return new; end if; -- nie gemeldet
    v_kind := 'appointment.cancelled';
  elsif new.status <> 'storniert' and coalesce(new.payment_status, '') <> 'pending'
        and (new.during is distinct from old.during or new.status is distinct from old.status
             or new.resource_id is distinct from old.resource_id or new.license_plate is distinct from old.license_plate
             or new.service_name is distinct from old.service_name) then
    v_kind := 'appointment.updated';
  else
    return new;
  end if;
  select * into v_cust from public.customers where id = new.customer_id;
  select r.name into v_place from public.resources r where r.id = new.resource_id;
  insert into public.integration_events (salon_id, appointment_id, kind, payload)
  values (new.salon_id, new.id, v_kind, jsonb_build_object(
    'event', v_kind,
    'occurred_at', now(),
    'appointment', jsonb_build_object('id', new.id, 'status', new.status, 'starts_at', lower(new.during), 'ends_at', upper(new.during),
        'service_name', new.service_name, 'license_plate', new.license_plate, 'vehicle_class', new.vehicle_class,
        'vehicle_info', new.vehicle_info, 'note', new.note, 'place', v_place, 'source', new.source),
    'customer', jsonb_build_object('name', v_cust.name, 'phone', v_cust.phone, 'email', v_cust.email)));
  return new;
end $$;
revoke all on function public.queue_integration_event() from public, anon, authenticated;
create trigger trg_queue_integration_event after insert or update on public.appointments
  for each row execute function public.queue_integration_event();

-- Fällige Ereignisse abholen (nur mit Cron-Schlüssel). Abgeholte Ereignisse sind 10 Minuten reserviert.
create function public.take_integration_events(p_key text, p_limit int default 20)
returns table (id uuid, salon_id uuid, kind text, payload jsonb, base_url text, api_key text, attempts int)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets s where s.name = 'cron_key' and s.value = p_key) then raise exception 'forbidden'; end if;
  return query
  with due as (
    select e.id from public.integration_events e
     where e.status = 'pending' and e.next_try_at <= now()
       and exists (select 1 from public.salon_integrations i where i.salon_id = e.salon_id and i.enabled)
     order by e.created_at limit least(greatest(p_limit, 1), 50) for update skip locked
  ), upd as (
    update public.integration_events e set attempts = e.attempts + 1, next_try_at = now() + interval '10 minutes'
      from due where e.id = due.id returning e.*
  )
  select u.id, u.salon_id, u.kind, u.payload, i.base_url, i.api_key, u.attempts
    from upd u join public.salon_integrations i on i.salon_id = u.salon_id
   order by u.created_at;
end $$;

-- Ergebnis der Auslieferung: bei Fehler später erneut (15 Min. mal Versuch), nach 8 Versuchen aufgeben
create function public.integration_event_result(p_key text, p_event uuid, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets s where s.name = 'cron_key' and s.value = p_key) then raise exception 'forbidden'; end if;
  if p_ok then
    update public.integration_events set status = 'sent', sent_at = now(), last_error = null where id = p_event;
  else
    update public.integration_events
       set last_error = left(coalesce(p_error, 'Fehler'), 300),
           status = case when attempts >= 8 then 'dead' else 'pending' end,
           next_try_at = now() + least(attempts, 6) * interval '15 minutes'
     where id = p_event;
  end if;
end $$;

-- Verbindungsdaten für einen Termin, nur wenn der Nutzer Mitglied des Betriebs ist (Nutzer-ID aus geprüftem Token)
create function public.integration_for_member(p_key text, p_user uuid, p_appt uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not exists (select 1 from public.app_secrets s where s.name = 'cron_key' and s.value = p_key) then raise exception 'forbidden'; end if;
  select jsonb_build_object('base_url', i.base_url, 'api_key', i.api_key, 'license_plate', a.license_plate)
    into r
    from public.appointments a
    join public.salon_integrations i on i.salon_id = a.salon_id and i.enabled
    join public.salon_members m on m.salon_id = a.salon_id and m.user_id = p_user and m.active
   where a.id = p_appt;
  return r;
end $$;

revoke all on function public.take_integration_events(text, int), public.integration_event_result(text, uuid, boolean, text),
  public.integration_for_member(text, uuid, uuid) from public;
grant execute on function public.take_integration_events(text, int), public.integration_event_result(text, uuid, boolean, text),
  public.integration_for_member(text, uuid, uuid) to anon, authenticated;
