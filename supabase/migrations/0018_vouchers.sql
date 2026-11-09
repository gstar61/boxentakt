-- Gutscheine: online kaufen (Stripe Checkout auf dem Konto des Salons) oder im Salon ausstellen, Einlösen in Teilbeträgen.
-- Gültig bis Ende des dritten Jahres nach Kauf (regelmäßige Verjährung, § 195 BGB).
alter table public.salons add column vouchers_enabled boolean not null default false;

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  code text not null unique,
  token uuid not null unique default gen_random_uuid(),
  amount_cents int not null check (amount_cents between 500 and 100000),
  balance_cents int not null default 0 check (balance_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'active', 'cancelled')),
  source text not null check (source in ('online', 'salon')),
  buyer_name text check (length(buyer_name) <= 100),
  buyer_email text check (length(buyer_email) <= 200),
  recipient_name text check (length(recipient_name) <= 100),
  message text check (length(message) <= 300),
  stripe_session_id text,
  valid_until date not null default (make_date(extract(year from now())::int + 3, 12, 31)),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index vouchers_salon_idx on public.vouchers (salon_id, created_at desc);
alter table public.vouchers enable row level security;
create policy vouchers_member_read on public.vouchers for select to authenticated using (public.is_member(salon_id));

create table public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.voucher_redemptions enable row level security;
create policy voucher_redemptions_member_read on public.voucher_redemptions for select to authenticated
  using (exists (select 1 from public.vouchers v where v.id = voucher_id and public.is_member(v.salon_id)));

-- lesbarer Code ohne verwechselbare Zeichen, z. B. TT-K7QM-4XPA
create or replace function public.voucher_code()
returns text language plpgsql volatile set search_path = '' as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    c := 'TT-' || (select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 4))
       || '-' || (select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from public.vouchers where code = c);
  end loop;
  return c;
end $$;

-- Server (Stripe-Key): Online-Kauf vorbereiten, liefert Gutschein + Connect-Konto
create or replace function public.stripe_voucher_create(p_key text, p_slug text, p_amount int, p_buyer_name text, p_buyer_email text, p_recipient text, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.salons; b public.salon_billing; v public.vouchers;
begin
  perform public.stripe_check_key(p_key);
  select * into s from public.salons where slug = p_slug;
  if not found or not s.vouchers_enabled then raise exception 'vouchers_disabled'; end if;
  select * into b from public.salon_billing where salon_id = s.id;
  if not coalesce(b.charges_enabled, false) or b.stripe_account_id is null or not public.salon_bookable(s.id) then raise exception 'vouchers_disabled'; end if;
  if p_amount is null or p_amount < 1000 or p_amount > 50000 then raise exception 'invalid_amount'; end if;
  p_buyer_name := btrim(coalesce(p_buyer_name, '')); p_buyer_email := lower(btrim(coalesce(p_buyer_email, '')));
  if length(p_buyer_name) < 2 or length(p_buyer_name) > 100 then raise exception 'invalid_name'; end if;
  if p_buyer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if (select count(*) from public.vouchers where salon_id = s.id and status = 'pending' and created_at > now() - interval '1 hour') >= 30
    then raise exception 'rate_limited'; end if;
  insert into public.vouchers (salon_id, code, amount_cents, source, buyer_name, buyer_email, recipient_name, message)
  values (s.id, public.voucher_code(), p_amount, 'online', p_buyer_name, p_buyer_email,
          nullif(btrim(coalesce(p_recipient, '')), ''), nullif(btrim(coalesce(p_message, '')), ''))
  returning * into v;
  return jsonb_build_object('id', v.id, 'token', v.token, 'account', b.stripe_account_id, 'salon_name', s.name, 'slug', s.slug);
end $$;

create or replace function public.stripe_voucher_session(p_key text, p_voucher uuid, p_session text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.stripe_check_key(p_key);
  update public.vouchers set stripe_session_id = p_session where id = p_voucher and status = 'pending';
end $$;

-- Server (Stripe-Key): Zahlung eingegangen → Gutschein aktiv, Daten für die Mail
create or replace function public.stripe_voucher_paid(p_key text, p_voucher uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.vouchers;
begin
  perform public.stripe_check_key(p_key);
  update public.vouchers set status = 'active', balance_cents = amount_cents, paid_at = now()
   where id = p_voucher and status = 'pending' returning * into v;
  if not found then return null; end if;
  return (select jsonb_build_object('code', v.code, 'token', v.token, 'amount_cents', v.amount_cents, 'valid_until', v.valid_until,
            'buyer_name', v.buyer_name, 'buyer_email', v.buyer_email, 'recipient_name', v.recipient_name, 'message', v.message,
            'salon_name', s.name, 'salon_slug', s.slug, 'salon_logo', s.logo_url, 'salon_address', s.address, 'salon_phone', s.phone,
            'owner_email', s.owner_email, 'reply_to', coalesce(s.contact_email, s.owner_email))
          from public.salons s where s.id = v.salon_id);
end $$;

-- öffentlich: Gutschein zum Anzeigen/Drucken über den geheimen Link
create or replace function public.voucher_by_token(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code', v.code, 'amount_cents', v.amount_cents, 'balance_cents', v.balance_cents, 'status', v.status,
           'valid_until', v.valid_until, 'recipient_name', v.recipient_name, 'message', v.message,
           'salon_name', s.name, 'salon_slug', s.slug, 'salon_logo', s.logo_url, 'salon_address', s.address, 'salon_phone', s.phone)
  from public.vouchers v join public.salons s on s.id = v.salon_id
  where v.token = p_token and v.status <> 'cancelled';
$$;

-- Salon: Gutschein ausstellen (z. B. bar bezahlt)
create or replace function public.voucher_issue(p_salon uuid, p_amount int, p_recipient text, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.vouchers;
begin
  if not public.is_member(p_salon) then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount < 500 or p_amount > 100000 then raise exception 'invalid_amount'; end if;
  insert into public.vouchers (salon_id, code, amount_cents, balance_cents, status, source, recipient_name, message, paid_at)
  values (p_salon, public.voucher_code(), p_amount, p_amount, 'active', 'salon',
          nullif(btrim(coalesce(p_recipient, '')), ''), nullif(btrim(coalesce(p_message, '')), ''), now())
  returning * into v;
  return jsonb_build_object('id', v.id, 'code', v.code, 'token', v.token);
end $$;

-- Salon: Betrag einlösen (auch in Teilen)
create or replace function public.voucher_redeem(p_salon uuid, p_code text, p_amount int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.vouchers;
begin
  if not public.is_member(p_salon) then raise exception 'forbidden'; end if;
  select * into v from public.vouchers
   where salon_id = p_salon and code = upper(replace(btrim(p_code), ' ', '')) for update;
  if not found or v.status <> 'active' then raise exception 'voucher_not_found'; end if;
  if v.valid_until < current_date then raise exception 'voucher_expired'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_amount > v.balance_cents then raise exception 'insufficient_balance'; end if;
  update public.vouchers set balance_cents = balance_cents - p_amount where id = v.id;
  insert into public.voucher_redemptions (voucher_id, amount_cents) values (v.id, p_amount);
  return jsonb_build_object('code', v.code, 'balance_cents', v.balance_cents - p_amount, 'amount_cents', v.amount_cents);
end $$;

-- Salon: Gutschein prüfen (Restwert, Gültigkeit)
create or replace function public.voucher_lookup(p_salon uuid, p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_member(p_salon) then
    (select jsonb_build_object('code', v.code, 'amount_cents', v.amount_cents, 'balance_cents', v.balance_cents, 'status', v.status,
              'valid_until', v.valid_until, 'recipient_name', v.recipient_name, 'buyer_name', v.buyer_name)
       from public.vouchers v where v.salon_id = p_salon and v.code = upper(replace(btrim(p_code), ' ', '')) and v.status <> 'pending')
  end;
$$;

revoke all on function public.voucher_code(), public.stripe_voucher_create(text, text, int, text, text, text, text),
  public.stripe_voucher_session(text, uuid, text), public.stripe_voucher_paid(text, uuid), public.voucher_by_token(uuid),
  public.voucher_issue(uuid, int, text, text), public.voucher_redeem(uuid, text, int), public.voucher_lookup(uuid, text) from public;
grant execute on function public.stripe_voucher_create(text, text, int, text, text, text, text), public.stripe_voucher_session(text, uuid, text),
  public.stripe_voucher_paid(text, uuid), public.voucher_by_token(uuid) to anon, authenticated;
grant execute on function public.voucher_issue(uuid, int, text, text), public.voucher_redeem(uuid, text, int), public.voucher_lookup(uuid, text) to authenticated;

-- Buchungsseite zeigt „Gutschein verschenken“, wenn eingeschaltet und Zahlungen möglich
create or replace function public.salon_vouchers_open(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.vouchers_enabled and coalesce(b.charges_enabled, false) and public.salon_bookable(s.id)
                   from public.salons s left join public.salon_billing b on b.salon_id = s.id where s.slug = p_slug), false);
$$;
grant execute on function public.salon_vouchers_open(text) to anon, authenticated;

-- /gutschein ist eine Plattform-Route
create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_slug ~ '^[a-z0-9-]{3,40}$'
     and p_slug not in ('api', 'dashboard', 'login', 'registrieren', 'storno', 'impressum', 'datenschutz', 'agb', 'bezahlt',
                        'abmelden', 'warteliste', 'passwort', 'gutschein', 'admin', 'www')
     and not exists (select 1 from public.salons where slug = p_slug);
$$;
