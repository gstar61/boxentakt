-- Monatsbericht an den Betreiber (Cron am 1. des Monats): Kennzahlen für einen Zeitraum, nur mit Cron-Key
create or replace function public.platform_report(p_key text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where name = 'cron_key' and value = p_key) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'salons_total', (select count(*) from public.salons),
    'salons_new', (select count(*) from public.salons where created_at >= p_from and created_at < p_to),
    'trialing', (select count(*) from public.salon_billing where not exempt and trial_ends_at > now()
                   and coalesce(subscription_status, '') not in ('active', 'trialing', 'past_due')),
    'paying', (select count(*) from public.salon_billing where subscription_status in ('active', 'trialing')),
    'past_due', (select count(*) from public.salon_billing where subscription_status = 'past_due'),
    'cancelling', (select count(*) from public.salon_billing where subscription_status = 'active' and cancel_at_period_end),
    'free', (select count(*) from public.salon_billing where exempt),
    'inactive', (select count(*) from public.salon_billing where delete_after is not null),
    'connect', (select count(*) from public.salon_billing where charges_enabled),
    'appointments', (select count(*) from public.appointments where created_at >= p_from and created_at < p_to),
    'appointments_online', (select count(*) from public.appointments where created_at >= p_from and created_at < p_to and source = 'online'),
    'cancelled', (select count(*) from public.appointments where created_at >= p_from and created_at < p_to and status = 'storniert'),
    'revenue_cents', (select coalesce(sum(price_cents), 0) from public.appointments
                       where lower(during) >= p_from and lower(during) < p_to and status in ('gebucht', 'erschienen')),
    'customers_new', (select count(*) from public.customers where created_at >= p_from and created_at < p_to),
    'vouchers_cents', (select coalesce(sum(amount_cents), 0) from public.vouchers where status = 'active' and created_at >= p_from and created_at < p_to),
    'feedback', (select count(*) from public.feedback where created_at >= p_from and created_at < p_to),
    'salons', coalesce((select jsonb_agg(jsonb_build_object(
        'name', s.name, 'slug', s.slug,
        'state', case when b.exempt then 'kostenlos' when b.subscription_status in ('active', 'trialing') then 'Abo'
                      when b.subscription_status = 'past_due' then 'Zahlung offen' when b.trial_ends_at > now() then 'Test'
                      else 'inaktiv' end,
        'appointments', (select count(*) from public.appointments a where a.salon_id = s.id and a.created_at >= p_from and a.created_at < p_to),
        'online', (select count(*) from public.appointments a where a.salon_id = s.id and a.created_at >= p_from and a.created_at < p_to and a.source = 'online'))
        order by s.created_at)
      from public.salons s left join public.salon_billing b on b.salon_id = s.id), '[]'::jsonb));
end $$;
revoke all on function public.platform_report(text, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.platform_report(text, timestamptz, timestamptz) to anon;
