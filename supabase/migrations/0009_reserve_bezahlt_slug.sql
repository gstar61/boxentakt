-- /bezahlt ist die Dankeseite nach dem Kassieren per QR-Code
create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_slug ~ '^[a-z0-9-]{3,40}$'
     and p_slug not in ('api', 'dashboard', 'login', 'registrieren', 'storno', 'impressum', 'datenschutz', 'agb', 'bezahlt', 'admin', 'www')
     and not exists (select 1 from public.salons where slug = p_slug);
$$;
