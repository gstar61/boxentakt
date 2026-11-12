@AGENTS.md

# Boxentakt – Projektkontext

Online-Terminbuchung + Kalender für Werkstätten (Reifen/Räderwechsel, freie Kfz-Werkstätten, Autohäuser/Flotten, später weitere Branchen). Slogan **„Termine im Takt.“** (`src/lib/brand.ts`). Domain geplant: **boxentakt.de** (frei geprüft, noch nicht registriert).

## Herkunft
Start als Kopie des Codes von **Trimtable** (Friseur-Buchung, Repo `gstar61/Trimtable`). Trimtable bleibt unverändert und eigenständig. Boxentakt hat eigenes Repo, **eigenes Supabase-Projekt, eigenes Vercel-Projekt, eigene Stripe-Produkte und eigene Resend-Domain** – nichts davon mit Trimtable teilen. Migrationen niemals auf das Trimtable-Supabase-Projekt anwenden.

## Stand
- Marke, Domain-Texte und Slogan sind auf Boxentakt umbenannt; sichtbare Texte, Startwerte, Landingpage, SEO, 404-Seite (rollendes Rad) sind auf Werkstatt umgestellt.
- **Fahrzeug** (Migration `0023_vehicles.sql`): `appointments.license_plate` (Pflicht online), `vehicle_class` (pkw/suv/transporter), `vehicle_info`; `salons.class_extra` = Zuschlag je Klasse in Minuten und Cent, verwaltet unter Einstellungen → Leistungen (`VehicleClassSection`). `book_services` hat dafür drei neue Parameter (`p_plate`, `p_class`, `p_vehicle`), der alte 8-Parameter-Aufruf und `book_appointment` entfallen.
- Interne Namen (Tabellen `salons`, `staff`, RPCs `*_salon*`, Variablen `salon`) bleiben vorerst, damit Migrationen und Funktionen nicht brechen. Sichtbar heißt es Betrieb/Mitarbeiter.
- **Plätze / Ressourcenplanung** (Migration `0024_resources.sql`, erweitert in `0027_multi_resources.sql`): Tabelle `resources` (Hebebühne, Wuchtmaschine, sonstige), `services.resource_kinds` (mehrere Arten je Leistung, „Braucht Platz“), Belegung in `appointment_resources` mit Exclusion-Constraint `no_resource_double_booking`. Ein Termin belegt **je benötigter Art einen** Platz (`appointments.resource_ids`, Hauptplatz weiter in `resource_id`). Die Plätze vergibt der Trigger `appointments_pick_resources` bei jedem Insert/Update (Online-Buchung, Dashboard, Verschieben; beim Verschieben bevorzugt dieselben). Hat ein Betrieb keinen aktiven Platz einer Art, wird sie ignoriert. Planungsart `salons.planning`: `plaetze` (Standard, nur Plätze zählen, `staff_exclusive = false`, Mitarbeiter dürfen sich überschneiden) oder `mitarbeiter` (zusätzlich muss ein Mitarbeiter frei sein). `busy_resources(slug, von, bis)` liefert die Belegung für die Buchungsseite (`freeSlots(..., { groups, busy, byPlace })`, `placeGroups`/`neededKinds` in `src/lib/time.ts`). Verwaltung: Einstellungen → Team & Zeiten (`ResourceSection`, inkl. Planungsart) und je Leistung „Braucht Platz“ (Mehrfachauswahl); Kalender-Tagesansicht Mitarbeiter/Plätze zeigt einen Termin in jeder belegten Platz-Spalte.
- `0024` repariert außerdem `busy_intervals`: Termine ohne Anzahlung (leeres `payment_status`) fielen durch `not (null)` aus den belegten Zeiten.
- Migrationen 0001–0027 sind gegen ein lokales PostgreSQL 16 mit Supabase-Stubs durchgelaufen und per SQL getestet (Buchung mit Fahrzeugklasse, Platzvergabe, mehrere Plätze, Planungsart, Doppelbelegung gesperrt, Verschieben). Gegen ein echtes Supabase-Projekt noch nicht ausgeführt (keins angelegt).
- **RadsatzPro-Anbindung, Boxentakt-Seite** (Migration `0026_integrations.sql`, Vertrag in `docs/radsatzpro-schnittstelle.md`): Verbindung je Betrieb (`salon_integrations`, nur Inhaber), Ausgangswarteschlange `integration_events` mit Trigger auf `appointments`, Auslieferung in `src/lib/radsatzpro.ts` (sofort per `after()`, Wiederholung im täglichen Cron), Radsatz-Abfrage per Klick im Termin (`lookupRadsatz`), Einstellung `RadsatzProSection`. Die Gegenseite in RadsatzPro (Endpunkte `/api/integration/boxentakt/*`, Schlüsselverwaltung) ist noch nicht gebaut, bis dahin zeigt Boxentakt „RadsatzPro nicht verbunden“.
- Noch nicht gebaut: Wartung/Sperrzeiten je Platz (geplant: von–bis mit Grund, auch wöchentlich wiederkehrend), Standorte, Flotten-Sammeltermine.
- Infrastruktur (Supabase, Vercel, Stripe, Resend, DNS) ist noch **nicht** angelegt (Supabase scheiterte am Limit von 2 Gratis-Projekten, braucht Pro). Anleitung: `docs/betrieb.md`, Variablen: `.env.example`. Migration `0025_cron_key.sql` erzeugt den Cron-Schlüssel. Datenbanktests: `supabase/tests/run.sh`, HTTP-Test der RadsatzPro-Schnittstelle: `npm run test:radsatz`.

## Geplanter Umbau
1. Ressourcen ausbauen: Sperrzeiten/Wartung je Platz (mehrere Plätze pro Termin ist fertig).
2. Optional Reifengröße im Termin; Fahrzeugdaten in der Kundenkartei.
3. Weitere Leistungen im Startkatalog (Batterie, Klima, Reifenreparatur).
4. Standorte und Flotten-Sammeltermine.
5. Gutscheine prüfen, ob für Werkstätten sinnvoll.
6. Anbindung an RadsatzPro, Gegenseite in RadsatzPro bauen (Endpunkte, Schlüssel, Migration); RadsatzPro bleibt führend für Kunde/Fahrzeug/Radsatz, Boxentakt für Termine/Kapazität. Keine gemeinsame Datenbank.
7. Google/SEO: Buchungslink im Unternehmensprofil, schema.org `AutoRepair`, Städteseiten.

## Zusammenarbeit
- Antworten auf Deutsch, kurz, konkrete Lösung statt langer Herleitung.
- Endkunden **Sie**, alles für Betriebe **du**.
- Vor dem Commit: `npx tsc --noEmit && npx eslint src && npm run build`
- Commits mit `gstar61 <gstar61@users.noreply.github.com>`
