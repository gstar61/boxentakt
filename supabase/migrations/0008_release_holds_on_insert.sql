-- Abgelaufene Anzahlungs-Reservierungen vor jedem neuen Termin freigeben (auch bei Einträgen im Kalender)
create or replace function public.release_expired_holds_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.release_expired_holds();
  return null;
end $$;
revoke all on function public.release_expired_holds_trigger() from public, anon, authenticated;
create trigger appointments_release_holds before insert or update of during, staff_id on public.appointments
  for each statement execute function public.release_expired_holds_trigger();
create index if not exists appointments_pending_idx on public.appointments (payment_expires_at) where payment_status = 'pending';
