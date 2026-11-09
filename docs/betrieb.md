# Betrieb und Einrichtung

Reihenfolge, in der Boxentakt in Betrieb genommen wird. Keine Schlüssel in diesem Dokument: Sie stehen nur in Vercel bzw. den jeweiligen Diensten. Vorlage aller Variablen: `.env.example`.

## 1. Supabase (eigenes Projekt, nicht das von Trimtable oder RadsatzPro)

1. Projekt `Boxentakt` anlegen, Region Frankfurt (`eu-central-1`). Gratis-Projekte werden nach 7 Tagen Inaktivität pausiert, für den Betrieb Pro verwenden.
2. Migrationen `supabase/migrations/0001` bis `0025` in dieser Reihenfolge einspielen (SQL-Editor, `supabase db push` oder MCP `apply_migration`). Nie auf ein anderes Projekt anwenden.
3. Schlüssel auslesen und in Vercel eintragen:
   ```sql
   select name, value from public.app_secrets;
   ```
   `cron_key` → `REMINDER_KEY`, `stripe_key` → `STRIPE_DB_KEY`.
4. Settings → API: `NEXT_PUBLIC_SUPABASE_URL` und den veröffentlichbaren Schlüssel als `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Auth → URL Configuration: Site URL `https://boxentakt.de`, Redirects `https://boxentakt.de/**`.
6. Auth-Mails über Resend-SMTP (`smtp.resend.com:465`, Benutzer `resend`, Passwort = Resend-Schlüssel, Absender `termine@boxentakt.de`). Vorlagen: `node scripts/auth-templates.ts` erzeugt das JSON für die Management-API (`PATCH /v1/projects/<ref>/config/auth`).

## 2. Vercel

1. Neues Projekt `boxentakt` aus dem GitHub-Repo `gstar61/boxentakt`, Region `fra1`.
2. Umgebungsvariablen aus `.env.example` eintragen. `CRON_SECRET` frei wählen (zufällig, lang).
3. Domains `boxentakt.de` und `www.boxentakt.de` hinzufügen. Deploy läuft bei jedem Push auf `main`.
4. Crons stehen in `vercel.json` (Erinnerungen täglich 16:00 UTC, Monatsbericht am 1. um 07:00 UTC).

## 3. Domain und Mail

- DNS: A/CNAME laut Vercel; für Mail DKIM, SPF und Rückläufer-MX laut Resend, `_dmarc` mindestens `p=none`.
- Resend: Domain `boxentakt.de` (EU-Region) verifizieren, Schlüssel nur mit Sendeberechtigung für diese Domain.
- Postfach `kontakt@boxentakt.de` (Impressum, Datenschutz, Fehlermeldungen) per Weiterleitung einrichten, bevor die Seite live geht.

## 4. Stripe

- Eigene Produkte für Boxentakt (Abo monatlich und jährlich) anlegen, Preis-IDs in `STRIPE_PRICE_ID` und `STRIPE_PRICE_ID_YEARLY`.
- Zwei Webhooks auf `https://boxentakt.de/api/stripe/webhook`: Plattform (Abo) und Connect (Anzahlungen, Gutscheine). Nie auf eine weiterleitende Adresse zeigen lassen, Stripe folgt keinen Weiterleitungen.
- Kundenportal mit Rücksprung auf `boxentakt.de` und Links zu AGB und Datenschutz einrichten.
- Preise und Rechnungs-Fußtext (Kleinunternehmerhinweis, falls zutreffend) vor dem Start prüfen.

## 5. Vor dem Start prüfen

- Impressum, Datenschutz und AGB (`src/lib/operator.ts`, `src/app/impressum`, `datenschutz`, `agb`) auf Richtigkeit der Betreiberdaten lesen.
- Durchlauf: registrieren, Betrieb anlegen, Leistung online buchen, Bestätigungsmail, Termin im Kalender, verschieben, absagen, Platz und Fahrzeug im Termin sichtbar.
- Datenbanktests lokal: `supabase/tests/run.sh` (braucht einen erreichbaren PostgreSQL-Server).

## 6. Später

- Google: Buchungslink im Unternehmensprofil, Search Console (Domain-Property per DNS-TXT), Sitemap einreichen.
- Backups: Supabase Pro bietet tägliche Sicherungen; Wiederherstellung einmal probeweise testen.
