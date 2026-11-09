-- Web-Push: Geräte des Salon-Teams, die bei neuer Online-Buchung benachrichtigt werden
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_salon_idx on public.push_subscriptions (salon_id);
alter table public.push_subscriptions enable row level security;
create policy push_own_read on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_own_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(salon_id));
create policy push_own_update on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_member(salon_id));
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- Server (Cron-Key): Ziel-Geräte für den Salon eines Termins
create or replace function public.push_targets(p_key text, p_appt uuid)
returns table (endpoint text, p256dh text, auth text, salon_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where name = 'cron_key' and value = p_key) then
    raise exception 'forbidden';
  end if;
  return query
  select p.endpoint, p.p256dh, p.auth, s.name
  from public.appointments a
  join public.salons s on s.id = a.salon_id
  join public.push_subscriptions p on p.salon_id = a.salon_id
  join public.salon_members m on m.salon_id = a.salon_id and m.user_id = p.user_id and m.active
  where a.id = p_appt;
end $$;

-- Server (Cron-Key): abgelaufene Geräte entfernen (Push-Dienst meldet 404/410)
create or replace function public.push_forget(p_key text, p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where name = 'cron_key' and value = p_key) then
    raise exception 'forbidden';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end $$;

revoke all on function public.push_targets(text, uuid), public.push_forget(text, text) from public;
grant execute on function public.push_targets(text, uuid), public.push_forget(text, text) to anon, authenticated;
