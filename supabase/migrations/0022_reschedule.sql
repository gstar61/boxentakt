-- Kunden verschieben ihren Termin selbst über den Link aus der Bestätigung (gleiche Person, gleiche Dauer)
alter table public.appointments add column reschedule_count smallint not null default 0;

create or replace function public.appointment_by_token(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', a.status, 'service_name', a.service_name, 'price_cents', a.price_cents,
    'starts_at', lower(a.during), 'ends_at', upper(a.during), 'staff_name', st.name, 'staff_id', st.id,
    'duration_min', (extract(epoch from upper(a.during) - lower(a.during)) / 60)::int,
    'salon_name', s.name, 'salon_slug', s.slug, 'salon_phone', s.phone, 'timezone', s.timezone,
    'deposit_cents', a.deposit_cents, 'payment_status', a.payment_status,
    'deposit_refundable', a.payment_status = 'paid' and lower(a.during) > now() + interval '24 hours',
    'can_cancel', a.status = 'gebucht' and coalesce(a.payment_status, '') <> 'pending' and lower(a.during) > now() + interval '2 hours',
    'can_move', a.status = 'gebucht' and coalesce(a.payment_status, '') <> 'pending' and lower(a.during) > now() + interval '2 hours'
                and a.reschedule_count < 3 and st.active and public.salon_bookable(s.id))
  from public.appointments a join public.salons s on s.id = a.salon_id join public.staff st on st.id = a.staff_id
  where a.cancel_token = p_token;
$$;

create or replace function public.reschedule_by_token(p_token uuid, p_start timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.appointments; s public.salons; v_local timestamp; v_end timestamptz; v_range tstzrange; v_old timestamptz;
        v_staff_name text; c public.customers;
begin
  select * into a from public.appointments where cancel_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if a.status <> 'gebucht' or coalesce(a.payment_status, '') = 'pending' or lower(a.during) <= now() + interval '2 hours'
    then raise exception 'too_late'; end if;
  if a.reschedule_count >= 3 then raise exception 'too_often'; end if;
  select * into s from public.salons where id = a.salon_id;
  if not public.salon_bookable(s.id) then raise exception 'not_bookable'; end if;
  select name into v_staff_name from public.staff where id = a.staff_id and active;
  if not found then raise exception 'slot_taken'; end if;

  if p_start < now() + interval '15 minutes' or p_start > now() + make_interval(days => s.booking_days)
    then raise exception 'outside_window'; end if;
  v_local := p_start at time zone s.timezone;
  if (extract(epoch from v_local::time)::int / 60) % s.slot_step <> 0 then raise exception 'invalid_time'; end if;
  v_old := lower(a.during);
  v_end := p_start + (upper(a.during) - lower(a.during));
  v_range := tstzrange(p_start, v_end);
  if not exists (select 1 from public.day_intervals(s.id, v_local::date) h
                 where v_local::time >= h.opens and (v_end at time zone s.timezone) <= v_local::date + h.closes)
    then raise exception 'closed'; end if;

  perform public.release_expired_holds();
  if exists (select 1 from public.absences ab where ab.salon_id = s.id
             and (ab.staff_id is null or ab.staff_id = a.staff_id) and ab.during && v_range)
    then raise exception 'slot_taken'; end if;

  begin
    update public.appointments set during = v_range, reschedule_count = reschedule_count + 1, reminder_sent_at = null
     where id = a.id;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  select * into c from public.customers where id = a.customer_id;
  return jsonb_build_object('cancel_token', a.cancel_token, 'old_start', v_old, 'starts_at', p_start, 'ends_at', v_end,
    'service_name', a.service_name, 'staff_name', v_staff_name, 'customer_name', c.name, 'customer_email', c.email,
    'customer_phone', c.phone, 'salon_name', s.name, 'salon_slug', s.slug, 'salon_phone', s.phone, 'salon_logo', s.logo_url,
    'owner_email', s.owner_email, 'timezone', s.timezone);
end $$;
revoke all on function public.reschedule_by_token(uuid, timestamptz) from public;
grant execute on function public.reschedule_by_token(uuid, timestamptz) to anon, authenticated;
