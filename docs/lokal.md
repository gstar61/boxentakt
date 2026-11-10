# Boxentakt lokal betreiben

Komplett auf dem eigenen Rechner, ohne Cloud-Dienste und ohne Kosten. Supabase läuft über die Supabase-CLI in Docker, die App mit `npm run dev`. Nur Testdaten verwenden.

## Voraussetzungen

| Was | Prüfen | Installieren (macOS) |
| --- | --- | --- |
| Docker Desktop (läuft) | `docker info` | `brew install --cask docker`, danach Docker starten |
| Node.js ≥ 20 | `node -v` | `brew install node` |
| Supabase-CLI | `npx supabase --version` | kommt mit `npm install` (devDependency) |

## Erster Start

```bash
npm install
npx supabase start          # lädt beim ersten Mal die Docker-Images, spielt Migrationen 0001–0025 ein
npx supabase status         # zeigt URL und Schlüssel
```

Leichter (ohne Studio, Storage, Realtime – reicht für Buchung und Kalender, aber kein Logo-Upload):

```bash
npx supabase start -x vector,logflare,imgproxy,edge-runtime,realtime,storage-api,supavisor,postgres-meta,studio
```

`.env.local` anlegen (wird nie committet):

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY aus supabase status>
APP_URL=http://localhost:3000
REMINDER_KEY=<Ergebnis von: select value from public.app_secrets where name = 'cron_key'>
# Stripe, Resend und Push bleiben lokal leer
```

Den `REMINDER_KEY` holt man so:

```bash
docker exec supabase_db_boxentakt psql -U postgres -At -c "select value from public.app_secrets where name = 'cron_key'"
```

Dann Demo-Daten und App:

```bash
npm run seed:demo
npm run dev                 # http://localhost:3000
```

## Demo-Zugang

- Dashboard: <http://localhost:3000/login> mit `demo@boxentakt.local` / `demo-werkstatt`
- Buchungsseite: <http://localhost:3000/werkstatt-mira>
- Inhalt: Werkstatt Mira, Mitarbeiter Mira und Jonas, Hebebühne 1 und 2, Startleistungen, Mo–Fr 8–17 Uhr, sechs Termine an den nächsten drei Werktagen (mit Kennzeichen, Fahrzeugklasse und Platz)
- `seed:demo` ist mehrfach ausführbar und legt nur fehlende Daten an. Es läuft nur gegen `127.0.0.1`/`localhost` und bricht sonst ab.

Neue Konten lassen sich unter `/registrieren` anlegen. Die E-Mail-Bestätigung ist lokal aus, man landet direkt im Dashboard. Mails der Anmeldung (z. B. Passwort vergessen) landen in Mailpit: <http://127.0.0.1:54324>.

## Zurücksetzen, Tests, Ausschalten

```bash
npx supabase db reset       # Datenbank leeren, alle Migrationen neu, danach npm run seed:demo
                            # (cron_key ist danach neu → REMINDER_KEY in .env.local anpassen)
PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres supabase/tests/run.sh
                            # Datenbanktests in eigener DB boxentakt_test
npx supabase stop           # alles aus, Daten bleiben erhalten
npx supabase stop --no-backup   # aus und Daten löschen
```

## Bekannte Grenzen

- **Keine E-Mails an Kunden:** ohne `RESEND_API_KEY` gehen Bestätigung, Erinnerung und Storno-Mail nicht raus. Den Storno-Link liefert die Datenbank: `select 'http://localhost:3000/storno/' || cancel_token from appointments where license_plate = 'MA-MR 123';` Die Seite nach dem Verschieben verspricht trotzdem „Eine Bestätigung kommt per E-Mail“.
- **Kein Stripe:** Abo, Anzahlung und Gutscheinkauf sind aus. Buchbar ist ein Betrieb nur in der 30-tägigen Testphase; danach `npx supabase db reset` und neu seeden oder die Testphase in `salon_billing.trial_ends_at` verlängern.
- **Kein Web-Push** ohne VAPID-Schlüssel.
- **Crons** (`/api/cron/reminders`, `/api/cron/report`) laufen lokal nicht von selbst; zum Testen in `.env.local` einen beliebigen `CRON_SECRET=lokal-test` setzen und `curl -H "Authorization: Bearer lokal-test" http://localhost:3000/api/cron/reminders` aufrufen.
- Mit der leichten Startvariante fehlen Storage (Logo/Bilder) und Studio.
- Die Termine aus `seed:demo` liegen relativ zum Ausführungstag; nach ein paar Tagen erneut ausführen.
