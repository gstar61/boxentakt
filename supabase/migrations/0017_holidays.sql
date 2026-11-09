-- Feiertage je Bundesland (online automatisch geschlossen) und Sondertage (Urlaub/geschlossen oder abweichende Zeiten).
-- Reihenfolge: Sondertag > Feiertag > normale Öffnungszeiten.
alter table public.salons add column holiday_state text
  check (holiday_state in ('BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH'));
-- Good Hair liegt in Mannheim (Baden-Württemberg)
update public.salons set holiday_state = 'BW' where slug = 'good-hair';

create table public.special_days (
  salon_id uuid not null references public.salons (id) on delete cascade,
  day date not null,
  opens time,
  closes time,
  note text check (length(note) <= 100),
  primary key (salon_id, day),
  check ((opens is null and closes is null) or (opens is not null and closes is not null and opens < closes))
);
alter table public.special_days enable row level security;
create policy special_days_member on public.special_days for all to authenticated
  using (public.is_member(salon_id)) with check (public.is_member(salon_id));

-- Ostersonntag (gregorianisch, anonymer Algorithmus)
create or replace function public.easter_sunday(y int)
returns date language plpgsql immutable set search_path = '' as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; dy int;
begin
  a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451; mo := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(y, mo, dy);
end $$;

-- gesetzliche Feiertage eines Bundeslands im Zeitraum
create or replace function public.public_holidays(p_state text, p_from date, p_to date)
returns table (day date, name text) language plpgsql stable set search_path = '' as $$
declare y int; e date; nov23 date;
begin
  if p_state is null then return; end if;
  for y in extract(year from p_from)::int .. extract(year from p_to)::int loop
    e := public.easter_sunday(y);
    nov23 := make_date(y, 11, 23);
    return query
    select x.d, x.n from (values
      (make_date(y, 1, 1), 'Neujahr', true),
      (make_date(y, 1, 6), 'Heilige Drei Könige', p_state in ('BW','BY','ST')),
      (make_date(y, 3, 8), 'Internationaler Frauentag', p_state in ('BE','MV')),
      (e - 2, 'Karfreitag', true),
      (e + 1, 'Ostermontag', true),
      (make_date(y, 5, 1), 'Tag der Arbeit', true),
      (e + 39, 'Christi Himmelfahrt', true),
      (e + 50, 'Pfingstmontag', true),
      (e + 60, 'Fronleichnam', p_state in ('BW','BY','HE','NW','RP','SL')),
      (make_date(y, 8, 15), 'Mariä Himmelfahrt', p_state in ('SL')),
      (make_date(y, 9, 20), 'Weltkindertag', p_state in ('TH')),
      (make_date(y, 10, 3), 'Tag der Deutschen Einheit', true),
      (make_date(y, 10, 31), 'Reformationstag', p_state in ('BB','HB','HH','MV','NI','SN','ST','SH','TH')),
      (make_date(y, 11, 1), 'Allerheiligen', p_state in ('BW','BY','NW','RP','SL')),
      -- Buß- und Bettag: Mittwoch vor dem 23. November
      (nov23 - (((extract(dow from nov23)::int - 3) + 7) % 7 + case when extract(dow from nov23)::int = 3 then 7 else 0 end), 'Buß- und Bettag', p_state in ('SN')),
      (make_date(y, 12, 25), '1. Weihnachtstag', true),
      (make_date(y, 12, 26), '2. Weihnachtstag', true)
    ) as x(d, n, applies)
    where x.applies and x.d between p_from and p_to;
  end loop;
end $$;

-- tatsächliche Öffnungszeiten eines Tages
create or replace function public.day_intervals(p_salon uuid, p_day date)
returns table (opens time, closes time) language plpgsql stable security definer set search_path = '' as $$
declare sd public.special_days; st text;
begin
  select * into sd from public.special_days where salon_id = p_salon and day = p_day;
  if found then
    if sd.opens is not null then return query select sd.opens, sd.closes; end if;
    return;
  end if;
  select holiday_state into st from public.salons where id = p_salon;
  if exists (select 1 from public.public_holidays(st, p_day, p_day)) then return; end if;
  return query select h.opens, h.closes from public.opening_hours h where h.salon_id = p_salon and h.weekday = extract(dow from p_day);
end $$;

grant execute on function public.easter_sunday(int), public.public_holidays(text, date, date) to anon, authenticated;
revoke all on function public.day_intervals(uuid, date) from public;

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
    'holiday_state', s.holiday_state,
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('day', ph.day, 'name', ph.name) order by ph.day)
                          from public.public_holidays(s.holiday_state, (now() at time zone s.timezone)::date,
                                                      (now() at time zone s.timezone)::date + s.booking_days) ph), '[]'::jsonb),
    'special_days', coalesce((select jsonb_agg(jsonb_build_object('day', sd.day, 'opens', to_char(sd.opens, 'HH24:MI'),
                                 'closes', to_char(sd.closes, 'HH24:MI'), 'note', sd.note) order by sd.day)
                              from public.special_days sd where sd.salon_id = s.id
                                and sd.day between (now() at time zone s.timezone)::date and (now() at time zone s.timezone)::date + s.booking_days), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                          'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday, h.opens)
                       from public.opening_hours h where h.salon_id = s.id), '[]'::jsonb))
  from public.salons s left join public.salon_billing b on b.salon_id = s.id
  where s.slug = p_slug;
$$;


create or replace function public.book_services(p_slug text, p_services uuid[], p_staff uuid, p_start timestamptz, p_name text, p_phone text, p_email text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.salons; b public.salon_billing; v_local timestamp; v_end timestamptz; v_range tstzrange; v_minutes int; v_names text;
  v_staff uuid; v_staff_name text; v_customer uuid; v_appt public.appointments; v_phone_norm text; v_deposit int; v_price int;
begin
  select * into s from public.salons where slug = p_slug;
  if not found then raise exception 'salon_not_found'; end if;
  if not public.salon_bookable(s.id) then raise exception 'not_bookable'; end if;
  if p_services is null or cardinality(p_services) = 0 or cardinality(p_services) > 4
     or cardinality(p_services) <> (select count(distinct x) from unnest(p_services) x) then raise exception 'service_not_found'; end if;
  if (select count(*) from public.services where id = any(p_services) and salon_id = s.id and active) <> cardinality(p_services)
    then raise exception 'service_not_found'; end if;
  -- order as chosen by the customer
  select sum(sv.duration_min), string_agg(sv.name, ' + ' order by o.n)
    into v_minutes, v_names
    from unnest(p_services) with ordinality o(id, n) join public.services sv on sv.id = o.id;
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
  v_end := p_start + make_interval(mins => v_minutes);
  v_range := tstzrange(p_start, v_end);
  if not exists (select 1 from public.day_intervals(s.id, v_local::date) h
                 where v_local::time >= h.opens
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

  select sum(coalesce(sp.price_cents, sv.price_cents)) into v_price
    from public.services sv left join public.staff_prices sp on sp.service_id = sv.id and sp.staff_id = v_staff
   where sv.id = any(p_services);
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
    insert into public.appointments (salon_id, staff_id, service_id, service_ids, customer_id, service_name, price_cents, during, source, note,
                                     deposit_cents, payment_status, payment_expires_at)
    values (s.id, v_staff, p_services[1], p_services, v_customer, v_names, v_price, v_range, 'online', p_note,
            v_deposit, case when v_deposit is not null then 'pending' end,
            case when v_deposit is not null then now() + interval '35 minutes' end)
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return jsonb_build_object('id', v_appt.id, 'cancel_token', v_appt.cancel_token, 'salon_slug', s.slug,
    'salon_name', s.name, 'salon_address', s.address, 'salon_phone', s.phone, 'owner_email', s.owner_email, 'salon_logo', s.logo_url,
    'timezone', s.timezone, 'staff_name', v_staff_name, 'service_name', v_names,
    'price_cents', v_price, 'starts_at', p_start, 'ends_at', v_end, 'deposit_cents', v_deposit);
end $$;

