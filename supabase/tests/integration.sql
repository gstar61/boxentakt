-- RadsatzPro-Schnittstelle: Verbindung, Ereigniswarteschlange, Abholung und Ergebnis.
-- Läuft nach booking.sql (nutzt dessen Betrieb test-werk).
\set ON_ERROR_STOP on

select set_config('t.sid', (select id::text from public.salons where slug = 'test-werk'), false);
select set_config('t.raed', (select id::text from public.services where name like 'Räderwechsel (%'), false);
select set_config('t.cron', (select value from public.app_secrets where name = 'cron_key'), false);
select set_config('t.slot', ((date_trunc('week', now() at time zone 'Europe/Berlin') + interval '7 days' + interval '15 hours') at time zone 'Europe/Berlin')::text, false);

do $$
declare sid uuid := current_setting('t.sid')::uuid; r jsonb; n int; a uuid;
begin
  -- Adressprüfung: keine IP-Adressen, kein http außer localhost
  begin insert into public.salon_integrations (salon_id, base_url, api_key) values (sid, 'http://10.0.0.5', repeat('k', 20)); assert false, 'http-IP erlaubt';
  exception when check_violation then null; end;
  begin insert into public.salon_integrations (salon_id, base_url, api_key) values (sid, 'https://127.0.0.1', repeat('k', 20)); assert false, 'https-IP erlaubt';
  exception when check_violation then null; end;
  begin insert into public.salon_integrations (salon_id, base_url, api_key) values (sid, 'https://radsatz.example.com', 'kurz'); assert false, 'kurzer Schlüssel erlaubt';
  exception when check_violation then null; end;

  -- ohne Verbindung keine Ereignisse
  assert (select count(*) from public.integration_events) = 0, 'Ereignisse ohne Verbindung';

  insert into public.salon_integrations (salon_id, base_url, api_key) values (sid, 'https://radsatz.example.com', repeat('k', 24));

  -- Buchung -> created
  perform set_config('role', 'anon', true);
  perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, current_setting('t.slot')::timestamptz,
                               'Erika Test', '0171 9999999', 'e@example.com', null, 'MA-RS 77', 'pkw', null);
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.integration_events where kind = 'appointment.created';
  assert n = 1, 'created-Ereignis fehlt';
  select appointment_id into a from public.integration_events where kind = 'appointment.created';
  select payload into r from public.integration_events where kind = 'appointment.created';
  assert r -> 'appointment' ->> 'license_plate' = 'MA-RS 77', 'Kennzeichen im Ereignis';
  assert r -> 'customer' ->> 'name' = 'Erika Test', 'Kunde im Ereignis';
  assert r -> 'appointment' ->> 'place' is not null, 'Platz im Ereignis';

  -- irrelevante Änderung (Erinnerung markiert) -> kein Ereignis
  update public.appointments set reminder_sent_at = now() where id = a;
  assert (select count(*) from public.integration_events) = 1, 'unnötiges Ereignis';

  -- Verschieben -> updated, Absage -> cancelled
  update public.appointments set during = tstzrange(lower(during) + interval '1 hour', upper(during) + interval '1 hour') where id = a;
  assert (select count(*) from public.integration_events where kind = 'appointment.updated') = 1, 'updated fehlt';
  update public.appointments set status = 'storniert' where id = a;
  assert (select count(*) from public.integration_events where kind = 'appointment.cancelled') = 1, 'cancelled fehlt';
end $$;

-- Abholung: falscher Schlüssel, dann richtiger; zweiter Aufruf liefert nichts (reserviert)
do $$
declare n int; ev record; k text := current_setting('t.cron');
begin
  begin perform * from public.take_integration_events('falsch'); assert false, 'falscher Schlüssel akzeptiert';
  exception when others then assert sqlerrm like '%forbidden%', 'erwartet forbidden, war: ' || sqlerrm; end;

  select count(*) into n from public.take_integration_events(k);
  assert n = 3, 'erwartet 3 abgeholte Ereignisse, war ' || n;
  assert (select count(*) from public.take_integration_events(k)) = 0, 'Ereignisse nicht reserviert';
  assert (select min(attempts) from public.integration_events) = 1, 'Versuchszähler';

  -- Erfolg und Fehler zurückmelden
  for ev in select id, kind from public.integration_events order by created_at loop
    if ev.kind = 'appointment.created' then perform public.integration_event_result(k, ev.id, true);
    else perform public.integration_event_result(k, ev.id, false, 'HTTP 500'); end if;
  end loop;
  assert (select count(*) from public.integration_events where status = 'sent') = 1, 'sent';
  assert (select count(*) from public.integration_events where status = 'pending' and last_error = 'HTTP 500' and next_try_at > now()) = 2, 'Wiederholung geplant';

  -- nach 8 Versuchen aufgeben
  update public.integration_events set attempts = 8 where kind = 'appointment.cancelled';
  perform public.integration_event_result(k, (select id from public.integration_events where kind = 'appointment.cancelled'), false, 'HTTP 500');
  assert (select status from public.integration_events where kind = 'appointment.cancelled') = 'dead', 'dead';
end $$;

-- Verbindungsdaten nur für Mitglieder; deaktivierte Verbindung erzeugt keine Ereignisse
do $$
declare sid uuid := current_setting('t.sid')::uuid; k text := current_setting('t.cron'); a uuid; r jsonb; n int;
begin
  select id into a from public.appointments where license_plate = 'MA-RS 77';
  r := public.integration_for_member(k, '11111111-1111-1111-1111-111111111111', a);
  assert r ->> 'base_url' = 'https://radsatz.example.com' and r ->> 'license_plate' = 'MA-RS 77', 'Verbindungsdaten Mitglied';
  assert public.integration_for_member(k, '22222222-2222-2222-2222-222222222222', a) is null, 'Fremder bekommt Daten';

  update public.salon_integrations set enabled = false where salon_id = sid;
  select count(*) into n from public.integration_events;
  update public.appointments set status = 'gebucht' where id = a;
  assert (select count(*) from public.integration_events) = n, 'Ereignis trotz deaktivierter Verbindung';
  assert public.integration_for_member(k, '11111111-1111-1111-1111-111111111111', a) is null, 'deaktivierte Verbindung liefert Daten';
end $$;

select 'integration.sql: alle Prüfungen bestanden' as ergebnis;
