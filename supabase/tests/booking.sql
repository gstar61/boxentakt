-- Buchungslogik: Fahrzeugklasse, Plätze (Hebebühne), Doppelbelegung, Verschieben.
-- Läuft nach allen Migrationen (siehe run.sh). Bricht mit einer Exception ab, wenn etwas nicht stimmt.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'chef@example.com');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.create_salon('Test Werkstatt', 'test-werk', 'Max');
insert into public.staff (salon_id, name, sort) select id, n, o from public.salons, (values ('Eva', 2), ('Tom', 3), ('Uli', 4)) v(n, o);

-- Montag nächster Woche, 10:00 Berlin
select set_config('t.mon', ((date_trunc('week', now() at time zone 'Europe/Berlin') + interval '7 days' + interval '10 hours') at time zone 'Europe/Berlin')::text, false);
select set_config('t.raed', (select id::text from public.services where name like 'Räderwechsel (%'), false);
select set_config('t.hu', (select id::text from public.services where name = 'HU/AU'), false);

do $$
declare r jsonb; ok boolean;
begin
  perform set_config('role', 'anon', true);

  -- 1) SUV-Räderwechsel: 45 + 15 Min., 49 + 10 €, bekommt Hebebühne 1
  r := public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, current_setting('t.mon')::timestamptz,
                            'Anna Test', '0171 1234567', 'a@example.com', null, 'MA-AB 123', 'suv', 'VW Tiguan');
  assert (r ->> 'price_cents')::int = 5900, 'SUV-Preis';
  assert (r ->> 'ends_at')::timestamptz - (r ->> 'starts_at')::timestamptz = interval '60 minutes', 'SUV-Dauer';

  -- 2) gleiche Zeit, einzige Hebebühne belegt -> slot_taken, obwohl Mitarbeiter frei
  begin
    perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, current_setting('t.mon')::timestamptz,
                                 'Bernd Test', '0171 7654321', null, null, 'HD-XY 99', 'pkw', null);
    assert false, 'zweite Buchung ohne freien Platz hätte scheitern müssen';
  exception when others then
    assert sqlerrm like '%slot_taken%', 'erwartet slot_taken, war: ' || sqlerrm;
  end;

  -- 3) HU/AU braucht keinen Platz
  perform public.book_services('test-werk', array[current_setting('t.hu')::uuid], null, current_setting('t.mon')::timestamptz,
                               'Carla Test', '0171 5555555', null, null, 'KA-CC 5', 'pkw', null);

  -- 4) ungültiges Kennzeichen
  begin
    perform public.book_services('test-werk', array[current_setting('t.hu')::uuid], null, current_setting('t.mon')::timestamptz + interval '3 hours',
                                 'Dirk Test', '0171 4444444', null, null, '!!', 'pkw', null);
    assert false, 'ungültiges Kennzeichen hätte scheitern müssen';
  exception when others then
    assert sqlerrm like '%invalid_plate%', 'erwartet invalid_plate, war: ' || sqlerrm;
  end;

  -- Belegung sichtbar für die Buchungsseite (auch Termine ohne Anzahlung)
  assert (select count(*) from public.busy_intervals('test-werk', now(), now() + interval '30 days')) > 0, 'busy_intervals leer';
  assert (select count(*) from public.busy_resources('test-werk', now(), now() + interval '30 days')) = 1, 'busy_resources';
  perform set_config('role', 'postgres', true);
end $$;

-- 5) zweite Hebebühne: gleiche Buchung klappt jetzt auf dem anderen Platz
insert into public.resources (salon_id, name, kind, sort) select id, 'Hebebühne 2', 'buehne', 2 from public.salons;
do $$
begin
  perform set_config('role', 'anon', true);
  perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, current_setting('t.mon')::timestamptz,
                               'Bernd Test', '0171 7654321', null, null, 'HD-XY 99', 'pkw', null);
  perform set_config('role', 'postgres', true);
  assert (select count(distinct resource_id) from public.appointments where resource_id is not null) = 2, 'zwei verschiedene Plätze';
end $$;

-- 6) Doppelbelegung direkt in der Tabelle: gleicher Platz, freier Mitarbeiter -> Constraint
do $$
begin
  insert into public.appointments (salon_id, staff_id, customer_id, service_name, during, resource_id)
  select a.salon_id, st.id, a.customer_id, 'X', a.during, a.resource_id
    from public.appointments a, public.staff st where st.name = 'Uli' and a.license_plate = 'MA-AB 123';
  assert false, 'Doppelbelegung hätte gesperrt werden müssen';
exception when exclusion_violation then null;
end $$;

-- 7) Verschieben per Token: Platz bleibt
select set_config('t.tok', (select cancel_token::text from public.appointments where license_plate = 'MA-AB 123'), false);
do $$
declare r jsonb;
begin
  perform set_config('role', 'anon', true);
  r := public.reschedule_by_token(current_setting('t.tok')::uuid, current_setting('t.mon')::timestamptz + interval '2 hours');
  perform set_config('role', 'postgres', true);
  assert (r ->> 'starts_at')::timestamptz = current_setting('t.mon')::timestamptz + interval '2 hours', 'neue Startzeit';
  assert (select resource_id is not null from public.appointments where license_plate = 'MA-AB 123'), 'Platz geblieben';
end $$;

-- 8) mehrere Plätze: Räderwechsel braucht Hebebühne + Wuchtmaschine
insert into public.resources (salon_id, name, kind, sort) select id, 'Wuchtmaschine', 'wuchtmaschine', 3 from public.salons;
update public.services set resource_kinds = '{buehne,wuchtmaschine}' where name like 'Räderwechsel (%';
do $$
declare r jsonb;
begin
  perform set_config('role', 'anon', true);
  r := public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, current_setting('t.mon')::timestamptz + interval '1 day',
                            'Erik Test', '0171 1000001', null, null, 'MA-MP 1', 'pkw', null);
  perform set_config('role', 'postgres', true);
  assert (select cardinality(resource_ids) from public.appointments where id = (r ->> 'id')::uuid) = 2, 'zwei Plätze belegt';
  assert (select count(*) from public.appointment_resources where appointment_id = (r ->> 'id')::uuid and active) = 2, 'Belegungstabelle';
  -- Hebebühne 2 wäre frei, die einzige Wuchtmaschine nicht
  begin
    perform set_config('role', 'anon', true);
    perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, current_setting('t.mon')::timestamptz + interval '1 day',
                                 'Fritz Test', '0171 1000002', null, null, 'MA-MP 2', 'pkw', null);
    assert false, 'Wuchtmaschine belegt, hätte scheitern müssen';
  exception when others then
    assert sqlerrm like '%slot_taken%', 'erwartet slot_taken, war: ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  -- Storno gibt beide Plätze frei
  update public.appointments set status = 'storniert' where id = (r ->> 'id')::uuid;
  assert (select count(*) from public.appointment_resources where appointment_id = (r ->> 'id')::uuid and active) = 0, 'Storno gibt frei';
  perform set_config('role', 'anon', true);
  perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, current_setting('t.mon')::timestamptz + interval '1 day',
                               'Fritz Test', '0171 1000002', null, null, 'MA-MP 2', 'pkw', null);
  perform set_config('role', 'postgres', true);
end $$;
update public.services set resource_kinds = '{buehne}' where name like 'Räderwechsel (%';

-- 9) Planungsart: nach Plätzen (Standard) darf derselbe Mitarbeiter doppelt; nach Mitarbeitern nicht
update public.staff set active = false where name <> 'Max';
do $$
declare t timestamptz := current_setting('t.mon')::timestamptz + interval '2 days';
begin
  perform set_config('role', 'anon', true);
  perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, t, 'Gina Test', '0171 2000001', null, null, 'MA-PL 1', 'pkw', null);
  perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, t, 'Hans Test', '0171 2000002', null, null, 'MA-PL 2', 'pkw', null);
  begin
    perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, t, 'Ida Test', '0171 2000003', null, null, 'MA-PL 3', 'pkw', null);
    assert false, 'beide Hebebühnen belegt, hätte scheitern müssen';
  exception when others then
    assert sqlerrm like '%slot_taken%', 'erwartet slot_taken, war: ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  assert (select count(*) from public.appointments where license_plate in ('MA-PL 1', 'MA-PL 2') and not staff_exclusive) = 2, 'nach Plätzen geplant';

  update public.salons set planning = 'mitarbeiter';
  perform set_config('role', 'anon', true);
  perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, t + interval '3 hours', 'Jan Test', '0171 2000004', null, null, 'MA-PL 4', 'pkw', null);
  begin
    perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, t + interval '3 hours', 'Kai Test', '0171 2000005', null, null, 'MA-PL 5', 'pkw', null);
    assert false, 'einziger Mitarbeiter belegt, hätte scheitern müssen';
  exception when others then
    assert sqlerrm like '%slot_taken%', 'erwartet slot_taken, war: ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  update public.salons set planning = 'plaetze';
end $$;
update public.staff set active = true;

-- 10) Sperrzeiten: einmalig (Do 10–12) und wöchentlich (Fr 8–10) für beide Hebebühnen
insert into public.resource_blocks (salon_id, resource_id, during, reason)
select r.salon_id, r.id, tstzrange(current_setting('t.mon')::timestamptz + interval '3 days', current_setting('t.mon')::timestamptz + interval '3 days 2 hours'), 'Wartung'
  from public.resources r where r.kind = 'buehne';
insert into public.resource_blocks (salon_id, resource_id, weekday, starts, ends, reason)
select r.salon_id, r.id, 5, '08:00', '10:00', 'Prüfung' from public.resources r where r.kind = 'buehne';
do $$
declare thu timestamptz := current_setting('t.mon')::timestamptz + interval '3 days';
        fri timestamptz := current_setting('t.mon')::timestamptz + interval '4 days' - interval '2 hours';
begin
  perform set_config('role', 'anon', true);
  begin
    perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, thu, 'Lea Test', '0171 3000001', null, null, 'MA-SP 1', 'pkw', null);
    assert false, 'gesperrte Hebebühnen, hätte scheitern müssen';
  exception when others then
    assert sqlerrm like '%slot_taken%', 'erwartet slot_taken, war: ' || sqlerrm;
  end;
  perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, thu + interval '3 hours', 'Lea Test', '0171 3000001', null, null, 'MA-SP 1', 'pkw', null);
  begin
    perform public.book_services('test-werk', array[current_setting('t.raed')::uuid], null, fri, 'Mia Test', '0171 3000002', null, null, 'MA-SP 2', 'pkw', null);
    assert false, 'wöchentliche Sperre, hätte scheitern müssen';
  exception when others then
    assert sqlerrm like '%slot_taken%', 'erwartet slot_taken, war: ' || sqlerrm;
  end;
  -- HU/AU braucht keinen Platz, Sperre egal
  perform public.book_services('test-werk', array[current_setting('t.hu')::uuid], null, fri, 'Mia Test', '0171 3000002', null, null, 'MA-SP 2', 'pkw', null);
  assert (select count(*) from public.busy_resources('test-werk', thu - interval '1 hour', thu + interval '3 hours')) >= 2, 'Sperre in busy_resources';
  perform set_config('role', 'postgres', true);
end $$;

select 'booking.sql: alle Prüfungen bestanden' as ergebnis;
