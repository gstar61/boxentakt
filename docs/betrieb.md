# Betrieb

Wo welche Einstellung liegt. Keine Schlüssel in diesem Dokument – die stehen nur in Vercel bzw. den jeweiligen Diensten.

## Domain trimtable.de (netcup, DNS bei netcup)

| Host | Typ | Wert | Zweck |
|---|---|---|---|
| `@` | A | `216.198.79.1` | Website (Vercel) |
| `www` | CNAME | `2e34410a1a60a5ae.vercel-dns-017.com.` | Weiterleitung auf trimtable.de |
| `resend._domainkey` | TXT | DKIM-Schlüssel aus Resend | Mailversand |
| `send` | MX (10) | `feedback-smtp.eu-west-1.amazonses.com` | Mailversand (Rückläufer) |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | Mailversand |
| `rsend` | CNAME | `send.forge.rmta.net.` | Mailversand |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | Zustellbarkeit |
| `@` | MX (10/20) | `mx1.improvmx.com`, `mx2.improvmx.com` | Postfach-Weiterleitung |
| `@` | TXT | `v=spf1 include:spf.improvmx.com ~all` | Postfach-Weiterleitung |

## Mails

- **App-Mails** (Buchung, Erinnerung, Absage, Warteliste, Bewertung, Feedback): Resend, Domain `trimtable.de` (Region eu-west-1), Schlüssel „Trimtable (Vercel, nur Versand)“ in Vercel als `RESEND_API_KEY`, Absender `MAIL_FROM=termine@trimtable.de`
- **Supabase-Mails** (Login, Passwort): SMTP `smtp.resend.com:465`, Benutzer `resend`, Absender „Trimtable“ `termine@trimtable.de`
- **Postfach**: ImprovMX leitet `kontakt@`, `termine@`, `support@`, `datenschutz@`, `rechnung@` ins Gmail weiter; Antworten aus Gmail „Senden als“ über `smtp.resend.com:587` mit eigenem Resend-Schlüssel „Gmail Senden als“

### Supabase-Mailvorlagen neu einspielen

```bash
node scripts/auth-templates.ts > /tmp/auth-templates.json
export SUPABASE_ACCESS_TOKEN=sbp_…
curl -s -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  https://api.supabase.com/v1/projects/wisgfxyuniguhhraqrct/config/auth -d @/tmp/auth-templates.json | head -c 150
```

## Supabase Auth

- `site_url` = `https://trimtable.de`, erlaubte Weiterleitungen `https://trimtable.de/**` und `https://salonbuch.vercel.app/**`
- Änderungen über die Management-API (`PATCH /v1/projects/wisgfxyuniguhhraqrct/config/auth`)

## Vercel (Team radsatzpro, Projekt trimtable)

- Domains `trimtable.de` und `www.trimtable.de`; `salonbuch.vercel.app` leitet per 308 auf trimtable.de weiter. Deploy bei jedem Push auf `main` von `gstar61/Trimtable`
- `APP_URL=https://trimtable.de` bestimmt die Links in Mails und Stripe
- Erinnerungs-Cron täglich 16:00 UTC (`vercel.json`)

## Stripe (Live-Konto)

- Produkt „Trimtable“ mit Preis 29 €/Monat und 290 €/Jahr, Kundenportal „Trimtable – Abo verwalten“
- Webhooks „Trimtable Abo (Plattform)“ und „Trimtable Anzahlungen (Connect)“ zeigen auf `https://trimtable.de/api/stripe/webhook`. Nie auf eine weitergeleitete Adresse stellen – Stripe folgt keinen Weiterleitungen
- Firmenname, Abbuchungstext und Branding stehen im Stripe-Dashboard unter Einstellungen
