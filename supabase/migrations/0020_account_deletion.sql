-- Automatische Löschung inaktiver Salons (Datenminimierung, Art. 5 Abs. 1 lit. e DSGVO)
-- Ohne Zugang (Testphase vorbei ohne Abo oder Abo beendet) wird ein Salon 90 Tage nach Ende des Zugangs gelöscht,
-- frühestens 30 Tage nach der ersten Mail. Erinnerungen: sofort, 30, 7 und 1 Tag vorher; danach eine Bestätigung.
-- Mit neuem Abo wird alles zurückgesetzt. Kostenlose Konten (exempt) werden nie gelöscht.
alter table public.salon_billing
  add column delete_after timestamptz,
  add column delete_notices smallint not null default 0,
  add column delete_notice_at timestamptz;

-- Löscht einen Salon vollständig: Termine, Kunden, Team, Einstellungen, Bilder und Logins, die zu keinem anderen Salon gehören.
create or replace function public.purge_salon(p_salon uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_users uuid[];
begin
  select coalesce(array_agg(user_id), '{}') into v_users from public.salon_members where salon_id = p_salon;
  delete from public.appointments where salon_id = p_salon;   -- vor staff (restrict)
  delete from public.salons where id = p_salon;               -- Rest per cascade
  delete from auth.users u where u.id = any(v_users)
    and not exists (select 1 from public.salon_members m where m.user_id = u.id);
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'salon-media' and (storage.foldername(name))[1] = p_salon::text;
end $$;
revoke all on function public.purge_salon(uuid) from public, anon, authenticated;

-- Täglich vom Cron: fällige Erinnerungen (stage 1–4) und erfolgte Löschungen (stage 5) zum Mailen zurückgeben.
create or replace function public.take_due_deletions(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_out jsonb := '[]'; v_stage int; v_to text[];
begin
  if not exists (select 1 from public.app_secrets where name = 'cron_key' and value = p_key) then raise exception 'forbidden'; end if;

  -- wieder aktiv: Löschung abbrechen
  update public.salon_billing b set delete_after = null, delete_notices = 0, delete_notice_at = null
   where b.delete_after is not null and (b.exempt or public.salon_bookable(b.salon_id));

  -- neu ohne Zugang: Löschtermin festlegen
  update public.salon_billing b
     set delete_after = greatest(
           greatest(b.trial_ends_at, coalesce(b.current_period_end, b.trial_ends_at)) + interval '90 days',
           now() + interval '30 days')
   where b.delete_after is null and not b.exempt and not public.salon_bookable(b.salon_id);

  for r in
    select b.salon_id, b.delete_after, b.delete_notices, b.delete_notice_at, s.name, s.slug, s.owner_email
      from public.salon_billing b join public.salons s on s.id = b.salon_id
     where b.delete_after is not null
  loop
    select coalesce(array_agg(distinct lower(e)), '{}') into v_to from (
      select r.owner_email e where r.owner_email is not null
      union select u.email from public.salon_members m join auth.users u on u.id = m.user_id
       where m.salon_id = r.salon_id and m.active and m.role = 'owner') x;

    if now() >= r.delete_after and r.delete_notices >= 4 and r.delete_notice_at < now() - interval '20 hours' then
      perform public.purge_salon(r.salon_id);
      v_out := v_out || jsonb_build_object('stage', 5, 'to', v_to, 'salon_name', r.name, 'salon_slug', r.slug, 'delete_after', r.delete_after);
      continue;
    end if;

    v_stage := case when now() >= r.delete_after - interval '1 day' then 4
                    when now() >= r.delete_after - interval '7 days' then 3
                    when now() >= r.delete_after - interval '30 days' then 2
                    else 1 end;
    if v_stage > r.delete_notices then
      -- letzte Erinnerung bekommt immer noch einen Tag Luft
      update public.salon_billing set delete_notices = v_stage, delete_notice_at = now(),
             delete_after = case when v_stage = 4 then greatest(delete_after, now() + interval '1 day') else delete_after end
       where salon_id = r.salon_id returning delete_after into r.delete_after;
      v_out := v_out || jsonb_build_object('stage', v_stage, 'to', v_to, 'salon_name', r.name, 'salon_slug', r.slug, 'delete_after', r.delete_after);
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.take_due_deletions(text) from public, authenticated;
grant execute on function public.take_due_deletions(text) to anon;
