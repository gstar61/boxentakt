-- Abweichende Preise je Mitarbeiter (z. B. Meisterin teurer als Azubi); ohne Eintrag gilt der Leistungspreis
create table public.staff_prices (
  staff_id uuid not null references public.staff (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  price_cents int not null check (price_cents between 0 and 1000000),
  primary key (staff_id, service_id)
);
create index staff_prices_salon_idx on public.staff_prices (salon_id);
alter table public.staff_prices enable row level security;
create policy staff_prices_member on public.staff_prices for all to authenticated
  using (public.is_member(salon_id)) with check (public.is_member(salon_id));

-- Buchungsseite: Preise je Person mitliefern
create or replace function public.public_salon(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name', s.name, 'address', s.address, 'phone', s.phone, 'notice', s.notice,
    'legal_name', s.legal_name, 'contact_email', s.contact_email, 'vat_id', s.vat_id, 'legal_extra', s.legal_extra,
    'timezone', s.timezone, 'slot_step', s.slot_step, 'booking_days', s.booking_days,
    'logo_url', s.logo_url, 'cover_url', s.cover_url,
    'bookable', public.salon_bookable(s.id),
    'deposit_percent', case when coalesce(b.charges_enabled, false) then s.deposit_percent else 0 end,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.sort, st.name)
                       from public.staff st where st.salon_id = s.id and st.active), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name,
                          'duration_min', sv.duration_min, 'price_cents', sv.price_cents,
                          'staff_prices', coalesce((select jsonb_object_agg(sp.staff_id, sp.price_cents)
                                                    from public.staff_prices sp join public.staff st on st.id = sp.staff_id and st.active
                                                    where sp.service_id = sv.id), '{}'::jsonb)) order by sv.sort, sv.name)
                       from public.services sv where sv.salon_id = s.id and sv.active), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                          'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday, h.opens)
                       from public.opening_hours h where h.salon_id = s.id), '[]'::jsonb))
  from public.salons s left join public.salon_billing b on b.salon_id = s.id
  where s.slug = p_slug;
$$;

-- Buchung: Preis und Anzahlung richten sich nach der Person, die den Termin bekommt
create or replace function public.book_appointment(p_slug text, p_service uuid, p_staff uuid, p_start timestamptz, p_name text, p_phone text, p_email text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; sv public.services; b public.salon_billing; v_local timestamp; v_end timestamptz; v_range tstzrange;
  v_staff uuid; v_staff_name text; v_customer uuid; v_appt public.appointments; v_phone_norm text; v_deposit int; v_price int;
begin
  select * into s from public.salons where slug = p_slug;
  if not found then raise exception 'salon_not_found'; end if;
  if not public.salon_bookable(s.id) then raise exception 'not_bookable'; end if;
  select * into sv from public.services where id = p_service and salon_id = s.id and active;
  if not found then raise exception 'service_not_found'; end if;
  select * into b from public.salon_billing where salon_id = s.id;

  p_name := btrim(coalesce(p_name, '')); p_phone := nullif(btrim(coalesce(p_phone, '')), '');
  p_email := nullif(lower(btrim(coalesce(p_email, ''))), ''); p_note := nullif(btrim(coalesce(p_note, '')), '');
  if length(p_name) < 2 or length(p_name) > 100 then raise exception 'invalid_name'; end if;
  if p_phone is null or length(regexp_replace(p_phone, '\D', '', 'g')) < 6 then raise exception 'invalid_phone'; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  v_phone_norm := nullif(regexp_replace(regexp_replace(p_phone, '\D', '', 'g'), '^(00)?49', '0'), '');

  if coalesce(b.charges_enabled, false) and s.deposit_percent > 0 and p_email is null then raise exception 'email_required'; end if;

  if (select count(*) from public.appointments a
      where a.salon_id = s.id and a.source = 'online' and a.created_at > now() - interval '10 minutes') >= 20
    then raise exception 'rate_limited'; end if;
  if (select count(*) from public.appointments a join public.customers c on c.id = a.customer_id
      where a.salon_id = s.id and c.phone_norm = v_phone_norm and a.status = 'gebucht' and lower(a.during) > now()) >= 3
    then raise exception 'too_many'; end if;

  if p_start < now() + interval '15 minutes' or p_start > now() + make_interval(days => s.booking_days)
    then raise exception 'outside_window'; end if;
  v_local := p_start at time zone s.timezone;
  if (extract(epoch from v_local::time)::int / 60) % s.slot_step <> 0 then raise exception 'invalid_time'; end if;
  v_end := p_start + make_interval(mins => sv.duration_min);
  v_range := tstzrange(p_start, v_end);
  if not exists (select 1 from public.opening_hours h
                 where h.salon_id = s.id and h.weekday = extract(dow from v_local)
                   and v_local::time >= h.opens
                   and (v_end at time zone s.timezone) <= v_local::date + h.closes)
    then raise exception 'closed'; end if;

  perform public.release_expired_holds();

  select st.id, st.name into v_staff, v_staff_name from public.staff st
   where st.salon_id = s.id and st.active and (p_staff is null or st.id = p_staff)
     and not exists (select 1 from public.appointments a where a.staff_id = st.id and a.status <> 'storniert' and a.during && v_range)
     and not exists (select 1 from public.absences ab where ab.salon_id = s.id
                     and (ab.staff_id is null or ab.staff_id = st.id) and ab.during && v_range)
   order by st.sort, st.name limit 1;
  if v_staff is null then raise exception 'slot_taken'; end if;

  v_price := coalesce((select sp.price_cents from public.staff_prices sp where sp.staff_id = v_staff and sp.service_id = sv.id), sv.price_cents);
  v_deposit := case when coalesce(b.charges_enabled, false) and s.deposit_percent > 0
                    then greatest(round(v_price * s.deposit_percent / 100.0)::int, 50) end;

  select c.id into v_customer from public.customers c
   where c.salon_id = s.id and c.phone_norm = v_phone_norm order by c.created_at limit 1;
  if v_customer is null then
    insert into public.customers (salon_id, name, phone, email)
    values (s.id, p_name, p_phone, p_email) returning id into v_customer;
  else
    update public.customers set name = p_name, email = coalesce(p_email, email) where id = v_customer;
  end if;

  begin
    insert into public.appointments (salon_id, staff_id, service_id, customer_id, service_name, price_cents, during, source, note,
                                     deposit_cents, payment_status, payment_expires_at)
    values (s.id, v_staff, sv.id, v_customer, sv.name, v_price, v_range, 'online', p_note,
            v_deposit, case when v_deposit is not null then 'pending' end,
            case when v_deposit is not null then now() + interval '35 minutes' end)
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object('id', v_appt.id, 'cancel_token', v_appt.cancel_token, 'salon_slug', s.slug,
    'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email,
    'timezone', s.timezone, 'staff_name', v_staff_name, 'service_name', sv.name,
    'price_cents', v_price, 'starts_at', p_start, 'ends_at', v_end, 'deposit_cents', v_deposit);
end $$;

-- Feedback der Salons an uns (Ideen, Probleme, Lob)
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  salon_id uuid references public.salons (id) on delete set null,
  kind text not null check (kind in ('idee', 'problem', 'lob')),
  message text not null check (length(message) between 3 and 4000),
  page text check (length(page) <= 200),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create policy feedback_own_insert on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and (salon_id is null or public.is_member(salon_id)));
create policy feedback_own_read on public.feedback for select to authenticated using (user_id = (select auth.uid()));
