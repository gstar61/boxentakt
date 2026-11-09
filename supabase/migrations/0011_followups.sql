-- Bewertungsanfrage am Tag nach dem Termin und Wiederbuchungs-Erinnerung nach X Wochen.
-- Werbliche Mails an Bestandskunden (§ 7 Abs. 3 UWG): Hinweis bei der Buchung, Abmeldelink in jeder Mail.

alter table public.salons add column google_review_url text
  check (google_review_url is null or google_review_url ~ '^https://');
alter table public.services add column rebook_weeks int check (rebook_weeks between 1 and 52);
alter table public.customers
  add column unsubscribe_token uuid not null default gen_random_uuid(),
  add column marketing_opt_out boolean not null default false;
create unique index customers_unsubscribe_token_idx on public.customers (unsubscribe_token);
alter table public.appointments add column review_sent_at timestamptz, add column rebook_sent_at timestamptz;

-- Täglich vom Cron aufgerufen: liefert fällige Mails und markiert sie als versendet
create or replace function public.take_due_followups(p_key text)
returns table (kind text, email text, customer_name text, salon_name text, salon_slug text, salon_phone text,
               reply_to text, service_name text, review_url text, unsubscribe_token uuid, weeks int)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where name = 'cron_key' and value = p_key) then
    raise exception 'forbidden';
  end if;

  return query
  with review as (
    -- je Kunde höchstens eine Anfrage pro Tag, nur wenn der Salon einen Bewertungslink hinterlegt hat
    update public.appointments a set review_sent_at = now()
    where a.id in (
      select distinct on (a2.customer_id) a2.id
      from public.appointments a2
      join public.salons s on s.id = a2.salon_id
      join public.customers c on c.id = a2.customer_id
      where a2.status in ('gebucht', 'erschienen') and coalesce(a2.payment_status, '') <> 'pending'
        and a2.review_sent_at is null and s.google_review_url is not null
        and c.email is not null and not c.marketing_opt_out
        and (upper(a2.during) at time zone s.timezone)::date = ((now() at time zone s.timezone)::date - 1)
        -- nicht, wenn die Kundin schon einmal eine Anfrage bekommen hat
        and not exists (select 1 from public.appointments p where p.customer_id = a2.customer_id and p.review_sent_at is not null)
      order by a2.customer_id, upper(a2.during) desc
    )
    returning a.id
  ),
  rebook as (
    -- letzter Termin je Kunde, dessen Leistung eine Erinnerung hat und der lange genug her ist, ohne künftigen Termin
    update public.appointments a set rebook_sent_at = now()
    where a.id in (
      select l.id from (
        select distinct on (a2.customer_id) a2.id, a2.customer_id, a2.during, a2.service_id, a2.rebook_sent_at, a2.salon_id
        from public.appointments a2
        where a2.status in ('gebucht', 'erschienen') and upper(a2.during) < now()
        order by a2.customer_id, upper(a2.during) desc
      ) l
      join public.services sv on sv.id = l.service_id
      join public.customers c on c.id = l.customer_id
      where sv.rebook_weeks is not null and l.rebook_sent_at is null
        and upper(l.during) + make_interval(weeks => sv.rebook_weeks) <= now()
        and upper(l.during) + make_interval(weeks => sv.rebook_weeks) > now() - interval '14 days'
        and c.email is not null and not c.marketing_opt_out
        and not exists (select 1 from public.appointments f where f.customer_id = l.customer_id
                        and f.status = 'gebucht' and lower(f.during) > now())
    )
    returning a.id
  )
  select 'review'::text, c.email, c.name, s.name, s.slug, s.phone, coalesce(s.contact_email, s.owner_email),
         a.service_name, s.google_review_url, c.unsubscribe_token, null::int
  from review r join public.appointments a on a.id = r.id
  join public.salons s on s.id = a.salon_id join public.customers c on c.id = a.customer_id
  union all
  select 'rebook'::text, c.email, c.name, s.name, s.slug, s.phone, coalesce(s.contact_email, s.owner_email),
         a.service_name, null::text, c.unsubscribe_token, sv.rebook_weeks
  from rebook r join public.appointments a on a.id = r.id
  join public.salons s on s.id = a.salon_id join public.customers c on c.id = a.customer_id
  join public.services sv on sv.id = a.service_id;
end $$;

-- Abmeldelink aus den Mails
create or replace function public.unsubscribe_marketing(p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_salon text;
begin
  update public.customers c set marketing_opt_out = true
   where c.unsubscribe_token = p_token
  returning (select s.name from public.salons s where s.id = c.salon_id) into v_salon;
  return v_salon;
end $$;

revoke all on function public.take_due_followups(text), public.unsubscribe_marketing(uuid) from public;
grant execute on function public.take_due_followups(text), public.unsubscribe_marketing(uuid) to anon, authenticated;

-- /abmelden und /warteliste sind Plattform-Routen
create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_slug ~ '^[a-z0-9-]{3,40}$'
     and p_slug not in ('api', 'dashboard', 'login', 'registrieren', 'storno', 'impressum', 'datenschutz', 'agb', 'bezahlt',
                        'abmelden', 'warteliste', 'admin', 'www')
     and not exists (select 1 from public.salons where slug = p_slug);
$$;
