@AGENTS.md

# Boxentakt – Projektkontext

Online-Terminbuchung + Kalender für Werkstätten (Reifen/Räderwechsel, freie Kfz-Werkstätten, Autohäuser/Flotten, später weitere Branchen). Slogan **„Termine im Takt.“** (`src/lib/brand.ts`). Domain geplant: **boxentakt.de** (frei geprüft, noch nicht registriert).

## Herkunft
Start als Kopie des Codes von **Trimtable** (Friseur-Buchung, Repo `gstar61/Trimtable`). Trimtable bleibt unverändert und eigenständig. Boxentakt hat eigenes Repo, **eigenes Supabase-Projekt, eigenes Vercel-Projekt, eigene Stripe-Produkte und eigene Resend-Domain** – nichts davon mit Trimtable teilen. Migrationen niemals auf das Trimtable-Supabase-Projekt anwenden.

## Stand
- Marke, Domain-Texte und Slogan sind auf Boxentakt umbenannt; sichtbare Texte, Startwerte, Landingpage, SEO, 404-Seite (rollendes Rad) sind auf Werkstatt umgestellt.
- **Fahrzeug** (Migration `0023_vehicles.sql`): `appointments.license_plate` (Pflicht online), `vehicle_class` (pkw/suv/transporter), `vehicle_info`; `salons.class_extra` = Zuschlag je Klasse in Minuten und Cent, verwaltet unter Einstellungen → Leistungen (`VehicleClassSection`). `book_services` hat dafür drei neue Parameter (`p_plate`, `p_class`, `p_vehicle`), der alte 8-Parameter-Aufruf und `book_appointment` entfallen.
- Interne Namen (Tabellen `salons`, `staff`, RPCs `*_salon*`, Variablen `salon`) bleiben vorerst, damit Migrationen und Funktionen nicht brechen. Sichtbar heißt es Betrieb/Mitarbeiter.
- **Plätze / Ressourcenplanung** (Migration `0024_resources.sql`): Tabelle `resources` (Hebebühne, Wuchtmaschine, sonstige), `services.resource_kind` („Braucht Platz“), `appointments.resource_id` mit Exclusion-Constraint `no_resource_double_booking`. Ein Termin belegt höchstens **einen** Platz; die Art folgt der Priorität Hebebühne > Wuchtmaschine > sonstige unter den gebuchten Leistungen. Hat ein Betrieb keinen aktiven Platz der Art, wird nichts geprüft. `book_services` und `reschedule_by_token` suchen einen freien Platz (beim Verschieben derselbe, sonst ein anderer der Art), `busy_resources(slug, von, bis)` liefert die Belegung für die Buchungsseite (`freeSlots(..., resources)` in `src/lib/time.ts`). Verwaltung: Einstellungen → Team & Zeiten (`ResourceSection`) und je Leistung „Braucht Platz“; Kalender-Tagesansicht hat den Schalter Mitarbeiter/Plätze; Termin eintragen und Verschieben im Dashboard vergeben den Platz über `pickPlace` (`_cal/data.ts`).
- `0024` repariert außerdem `busy_intervals`: Termine ohne Anzahlung (leeres `payment_status`) fielen durch `not (null)` aus den belegten Zeiten.
- Migrationen 0001–0024 sind gegen ein lokales PostgreSQL 16 mit Supabase-Stubs durchgelaufen und per SQL getestet (Buchung mit Fahrzeugklasse, Platzvergabe, Doppelbelegung gesperrt, Verschieben). Gegen ein echtes Supabase-Projekt noch nicht ausgeführt (keins angelegt).
- Noch nicht gebaut: mehrere Plätze pro Termin (z. B. Hebebühne + Wuchtmaschine), Wartung/Sperrzeiten je Platz, Standorte, Flotten-Sammeltermine, RadsatzPro-Anbindung.
- Infrastruktur (Supabase, Vercel, Stripe, Resend, DNS) ist noch **nicht** angelegt (Supabase scheiterte am Limit von 2 Gratis-Projekten, braucht Pro). Anleitung: `docs/betrieb.md`, Variablen: `.env.example`. Migration `0025_cron_key.sql` erzeugt den Cron-Schlüssel. Datenbanktests: `supabase/tests/run.sh`.

## Geplanter Umbau
1. Ressourcen ausbauen: mehrere Plätze pro Termin, Sperrzeiten/Wartung je Platz.
2. Optional Reifengröße im Termin; Fahrzeugdaten in der Kundenkartei.
3. Weitere Leistungen im Startkatalog (Batterie, Klima, Reifenreparatur).
4. Standorte und Flotten-Sammeltermine.
5. Gutscheine prüfen, ob für Werkstätten sinnvoll.
6. Anbindung an RadsatzPro (nach dem eigenständigen Start): API-Schlüssel + Webhooks, RadsatzPro bleibt führend für Kunde/Fahrzeug/Radsatz, Boxentakt für Termine/Kapazität. Keine gemeinsame Datenbank.
7. Google/SEO: Buchungslink im Unternehmensprofil, schema.org `AutoRepair`, Städteseiten.

## Zusammenarbeit
- Antworten auf Deutsch, kurz, konkrete Lösung statt langer Herleitung.
- Endkunden **Sie**, alles für Betriebe **du**.
- Vor dem Commit: `npx tsc --noEmit && npx eslint src && npm run build`
- Commits mit `gstar61 <gstar61@users.noreply.github.com>`
