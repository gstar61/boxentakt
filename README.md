# Boxentakt

**Termine im Takt.** Online-Terminbuchung, Kalender und Kundenkartei für Werkstätten (im Umbau aus der Trimtable-Vorlage).

Domain geplant: boxentakt.de (noch nicht live).

## Funktionen

- `/<slug>` – öffentliche Buchungsseite je Betrieb, ohne Kundenkonto (Kennzeichen und Fahrzeugklasse, Preise je Person, Warteliste, Kalender-Export, optionale Anzahlung)
- `/storno/<token>` – Absage-Link aus der Bestätigungs-Mail
- `/login`, `/registrieren`, `/passwort` – Konto für Betriebsinhaber und Team
- `/dashboard` – Tages- und Wochenkalender, Kundenkartei mit CSV-Export, Kassieren per QR-Code, Einstellungen
- Erinnerung am Vortag, Google-Bewertungsbitte, Wiederbuchungs-Erinnerung, Push aufs Handy bei neuer Buchung (PWA)
- Abo über Stripe (29 €/Monat oder 290 €/Jahr), Anzahlungen über Stripe Connect direkt an den Betrieb

## Stack

Next.js 16 (App Router) · React 19 · Tailwind 4 · Supabase (Postgres, Auth, RLS, Storage) · Stripe · Resend · Vercel

Doppelbuchungen verhindert die Datenbank selbst (Exclusion-Constraints auf Mitarbeiter und auf Platz, z. B. Hebebühne, jeweils mit Zeitraum).
Öffentliche Zugriffe laufen nur über Security-Definer-Funktionen – Kundendaten sind nur für Mitglieder des Betriebs lesbar.
Migrationen liegen in `supabase/migrations/`, Einrichtung und Betrieb in [docs/betrieb.md](docs/betrieb.md), Datenbanktests in `supabase/tests/`.

Hinweis: Intern heißen Tabellen und Funktionen noch `salons`, `staff` usw. (Erbe der Vorlage). Sichtbar im Produkt heißt es Betrieb, Mitarbeiter und Platz.


## Umgebungsvariablen

| Name | Zweck |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase-Projekt |
| `APP_URL` | Basis-URL für Links in Mails und Stripe (`https://boxentakt.de`) |
| `RESEND_API_KEY`, `MAIL_FROM` | Mailversand über Resend (`termine@boxentakt.de`) |
| `CRON_SECRET`, `REMINDER_KEY` | Erinnerungs-Cron (`REMINDER_KEY` = `app_secrets.cron_key`) |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_PRICE_ID_YEARLY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_DB_KEY` | Abo und Anzahlungen |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web-Push |

## Lokal

```bash
vercel env pull .env.local
npm install
npm run dev
```

Vor dem Commit: `npx tsc --noEmit && npx eslint src && npm run build`
