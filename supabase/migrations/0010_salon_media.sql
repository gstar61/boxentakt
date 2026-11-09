-- Logo und Titelbild pro Salon (Supabase Storage, öffentlich lesbar)
alter table public.salons add column logo_url text, add column cover_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('salon-media', 'salon-media', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Pfad: <salon_id>/<datei>; schreiben dürfen nur Mitglieder dieses Salons
create policy salon_media_select on storage.objects for select to authenticated
  using (bucket_id = 'salon-media' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy salon_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'salon-media' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy salon_media_update on storage.objects for update to authenticated
  using (bucket_id = 'salon-media' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy salon_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'salon-media' and public.is_member(((storage.foldername(name))[1])::uuid));

-- Öffentliche Salondaten um Logo und Titelbild ergänzt
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
                          'duration_min', sv.duration_min, 'price_cents', sv.price_cents) order by sv.sort, sv.name)
                       from public.services sv where sv.salon_id = s.id and sv.active), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                          'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday, h.opens)
                       from public.opening_hours h where h.salon_id = s.id), '[]'::jsonb))
  from public.salons s left join public.salon_billing b on b.salon_id = s.id
  where s.slug = p_slug;
$$;
