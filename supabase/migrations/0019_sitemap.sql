-- Sitemap: Slugs der öffentlich buchbaren Salons (stehen ohnehin auf den Buchungsseiten)
create or replace function public.public_salon_slugs()
returns setof text language sql stable security definer set search_path = '' as $$
  select s.slug from public.salons s where public.salon_bookable(s.id) order by s.slug;
$$;
grant execute on function public.public_salon_slugs() to anon, authenticated;
