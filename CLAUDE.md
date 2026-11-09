@AGENTS.md

# Trimtable – Projektkontext (vormals Salonbuch)

Online-Terminbuchung + Kalender für Friseursalons, als provisionsfreie Treatwell-Alternative. Marke **Trimtable** (Trim + Timetable), Domain **trimtable.de** (netcup, nur Domain; DNS bei netcup). GitHub-Repo heißt `gstar61/Trimtable` (im Container zeigt `origin` weiter auf die alte Adresse `gstar61/Salonbuch`, GitHub leitet um); Vercel-Projekt heißt `trimtable`; Supabase und localStorage-Schlüssel heißen weiter `salonbuch`.
Erster Kunde: **Good Hair Salon** (Inhaberin/Friseurin Selda, Jakob-Faulhaber-Str. 10, 68305 Mannheim), Buchungsseite `/good-hair`.
Langfristig SaaS für mehrere Salons (generische Landingpage wie bei RadsatzPro).

## Zusammenarbeit
- Antworten auf Deutsch, kurz, konkrete Lösung statt langer Herleitung.
- Ansprache im Produkt: Endkunden und Landingpage **Sie** (Buchung, Gutschein, Storno, Fehlerseiten, Kundenmails); alles für Salons **du** (Registrieren, Login, Dashboard, Auth- und Salon-Mails)
- Shell-Anleitungen: ein Befehl nach dem anderen, benötigte `export …` (z. B. `SUPABASE_ACCESS_TOKEN`) immer zuerst nennen, dann den Befehl, Dateiänderungen als fertige Befehle (kein nano), vorher aktuellen Wert abfragen, ansagen wenn weitere Schritte folgen.
- Design: Linear/Stripe/Vercel-Stil, Geldbeträge ohne Monospace (`tabular-nums`), `euro()` ohne „,00“ bei glatten Beträgen, Dashboard auf dem Handy mit Tab-Leiste unten (5 Tabs), Kalender am Handy eine Person pro Tag (Wahl per Pill, „Alle“), Kundenkartei am Handy als Karten, Auswahl-Zustand überall Akzent-Rand + leichter Akzent-Ton (`.pill[aria-pressed]`), Preise „ab“ nur wenn sie je Person abweichen, Geist-Font, nur Lucide-Icons, keine Emojis. Hell + Dunkel nach Systemeinstellung, Umschalter (System/Hell/Dunkel, `ThemeToggle`, localStorage `salonbuch-theme`) in Dashboard und Landing-Footer. Dunkel: #0B1220, Cards #111827, Akzent #14D39A; Hell: #F7F8FA, Cards #FFFFFF, Akzent #047857. Farben nur über Tokens in `globals.css` (`bg-fg/5` statt `bg-white/5`), nie hart kodieren

## Stack & Infrastruktur
- Next.js 16 (App Router, Turbopack) – vor Code-Änderungen `node_modules/next/dist/docs/` beachten (siehe AGENTS.md)
- Tailwind 4 (Tokens in `src/app/globals.css`), React 19, TypeScript, lucide-react
- **Supabase** Projekt `Salonbuch`, ref `wisgfxyuniguhhraqrct`, Region eu-central-1, Org „Alpha“
- **Vercel** Team `radsatzpro`, Projekt `trimtable` (vormals `salonbuch`, `prj_EyjmDhEGRntlAHysca9mx1FXOGJ7`), Region fra1, Live: https://trimtable.de
- Domain: `trimtable.de` + `www` (Weiterleitung) im Vercel-Projekt; DNS bei netcup: A `@` → 216.198.79.1, CNAME `www` → 2e34410a1a60a5ae.vercel-dns-017.com. `APP_URL`=https://trimtable.de (Links in Mails/Stripe); salonbuch.vercel.app leitet per 308 auf trimtable.de um – deshalb zeigen die Stripe-Webhooks auf https://trimtable.de/api/stripe/webhook (Stripe folgt keinen Weiterleitungen)
- Slogan „Termine ohne Haarspalterei.“ (`src/lib/brand.ts`: Landing-Footer, Social-Vorschau, Mail-Fußzeile)
- Logo: 3×3-Stundenplan (auch Platzhalter für Salons ohne eigenes Logo in Dashboard, Buchungsseite, Einstellungen) (`src/components/Logo.tsx`, `icon.svg`, `apple-icon.tsx`, PNGs in `public/`), ein Feld belegt (Vordergrundfarbe), eins vergangen (blass)
- Deploy: Push auf `main` von GitHub `gstar61/Trimtable` → Vercel baut automatisch
- Mails: **Resend** (REST-API, `RESEND_API_KEY` „Trimtable (Vercel, nur Versand)“ nur für Domain `trimtable.de` (verifiziert, eu-west-1), Absender `MAIL_FROM`=termine@trimtable.de mit Salonname als Anzeigename, Antworten an den Salon); Gmail-SMTP nur noch Rückfall ohne Resend-Schlüssel; Erinnerungs-Cron täglich 16:00 UTC (`vercel.json`): Erinnerung für morgen, Google-Bewertungsbitte (einmalig, Tag nach dem ersten Termin) und Wiederbuchungs-Erinnerung (nach `rebook_weeks`, nur ohne neuen Termin); werbliche Mails mit Abmeldelink `/abmelden/[token]` (§ 7 Abs. 3 UWG)
- Supabase Auth: `site_url` https://trimtable.de, Redirects `trimtable.de/**` + `salonbuch.vercel.app/**` (lokal wird nicht entwickelt), Auth-Mails über smtp.resend.com (Benutzer `resend`, Passwort = Resend-Schlüssel, Absender „Trimtable“ termine@trimtable.de); Passwort vergessen auf `/login` → Link auf `/passwort`; geändert per Management-API `PATCH /v1/projects/wisgfxyuniguhhraqrct/config/auth`
- Analytics + Speed Insights von Vercel sind eingebaut
- **Monatsbericht** an `OPERATOR.email` (oder `REPORT_TO`): Cron `/api/cron/report` am 1. um 07:00 UTC, Kennzahlen per `platform_report` + MRR aus Stripe-Abos, Vormonat in Klammern (`sendReport`)
- **PWA + Push**: `src/app/manifest.ts`, Icons in `public/` (`icon-192/512`, `icon-maskable`, `badge`), Service Worker `public/sw.js` (Header in `next.config.ts`); Push bei jeder Online-Buchung an alle aktiven Geräte des Teams (`src/lib/push.ts`, `web-push`), Einschalten je Gerät unter Einstellungen (`PushSection`, iPhone nur vom Home-Bildschirm). Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **Stripe**: Abo 29 €/Monat oder 290 €/Jahr (2 Monate gratis) ohne USt., Kleinunternehmer § 19 UStG – Hinweis als Rechnungs-Fußtext am Stripe-Kunden (Checkout + Kundenportal, 30 Tage Test, Bestandssalons `exempt`), Online-Anzahlung über Connect (Accounts v2 mit vollem Stripe-Dashboard, Gebühren trägt der Salon, Direct Charges, keine Plattformgebühr; v1-Kontoanlage ist in neuen Stripe-Umgebungen gesperrt). Webhook `/api/stripe/webhook` (Plattform- und Connect-Endpunkt), Abbruch `/api/stripe/abbruch`. Env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (monatlich), `STRIPE_PRICE_ID_YEARLY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_DB_KEY` (= `app_secrets.stripe_key`)
  - Stripe-Produkt, Kundenportal (Überschrift, Datenschutz/AGB/Rücksprung auf trimtable.de) und Webhook-Beschreibungen heißen „Trimtable“; Webhook-URLs auf trimtable.de. Kontoname, Branding und Abbuchungstext „TRIMTABLE“ sind gesetzt
  - Stripe-Konten: „Salonbuch“ (live, `acct_1UTh8UDRq2j16stp`, **aktiv**) und „Salonbuch Sandbox“ (`acct_1UTh8iDqAk8Qrp5d`). Live: Produkt `prod_VUj8chldfQ5sd1`, Preise `price_1UTk8xDRq2j16stpzkCUbElx` (29 €/Monat, lookup `salonbuch_monthly`) + `price_1UTk90DRq2j16stpcEaBSDnd` (290 €/Jahr, `salonbuch_yearly`; alter 19-€-Preis archiviert; Wechsel im Kundenportal erlaubt), Webhooks `we_1UTjg7DRq2j16stpR6QDcYXL` (Plattform) + `we_1UTjgDDRq2j16stpmOmka5Vr` (Connect), Kundenportal `bpc_1UTjgKDRq2j16stp6dxTZ2ej`. Sandbox: Produkt `prod_VUhoEvYDEwDgQM`, Preis `price_1UTiP7DqAk8Qrp5ddD369BAz`, Webhooks `we_1UTiPGDqAk8Qrp5dlg4QQfgM` + `we_1UTiQ3DqAk8Qrp5dz4ChGt7Y`, Portal `bpc_1UTiQJDqAk8Qrp5dRRfe3qma`
  - Container-Netz sperrt api.stripe.com: Stripe nur über den Stripe-Connector (MCP) bedienen

## Lokal starten
- Env-Variablen holen: `vercel env pull .env.local` (Projekt ist mit `vercel link --project salonbuch --scope radsatzpro` verknüpft)
- `npm install`, `npm run dev`
- Vor dem Commit: `npx tsc --noEmit && npx eslint src && npm run build`
- Screenshots ohne Supabase-Zugang (Cloud-Container): `node scripts/mock-supabase.mjs` (Demo-Salon `studio-mira`, Login per Cookie `sb-localhost-auth-token`), dann mit `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` bauen und starten; danach normal neu bauen
- Commits mit `gstar61 <gstar61@users.noreply.github.com>` – GitHub lehnt die private Mailadresse ab (Email privacy)

## Datenbank (`supabase/migrations/`, in Reihenfolge angewendet)
- `0001` Grundschema: salons, salon_members, staff, services, opening_hours, customers, appointments, app_secrets; RLS über `is_member()`
- `0002` mehrere Öffnungszeiten pro Tag (Pausen), `salons.notice`
- `0003` Impressumsfelder, `customers.phone_norm` + `note`, View `customer_stats`, Tabelle `absences`
- `0004` `salon_invites`, `salon_members.active`, `create_salon`, `slug_available`, `salon_team`, `remove_member`
- `0005` Mitglieder-Funktionen nicht für `anon`
- `0006` Slug `agb` reserviert
- `0007` `salon_billing` (Abo/Test/Connect, nur lesbar für Mitglieder), `salons.deposit_percent`, Anzahlungsfelder an `appointments` (`payment_status` pending/paid/refunded/expired, Reservierung 35 min), `salon_bookable`, Stripe-RPCs `stripe_*` mit Schlüssel `stripe_key`
- `0008` abgelaufene Reservierungen vor jedem Insert/Verschieben freigeben
- `0009` Slug `bezahlt` reserviert
- `0011` Bewertung/Wiederbuchung: `salons.google_review_url`, `services.rebook_weeks`, `customers.unsubscribe_token`/`marketing_opt_out`, `appointments.review_sent_at`/`rebook_sent_at`, RPCs `take_due_followups` (Cron-Key) und `unsubscribe_marketing`; Slugs `abmelden`, `warteliste` reserviert
- `0012` Warteliste: Tabelle `waitlist` (Mitglieder lesen/löschen), RPCs `join_waitlist` (öffentlich, Limits), `take_waitlist`/`take_waitlist_by_token` (Cron-Key) – Mail an alle Wartenden des Tages bei Absage (Kunden-Link und Dashboard), Link `/{slug}?tag=…&leistung=…`
- `0013` Web-Push: Tabelle `push_subscriptions` (je Gerät, RLS nur eigene Zeilen + Mitglied), RPCs `push_targets`/`push_forget` (Cron-Key)
- `0014` `staff_prices` (abweichender Preis je Person und Leistung; `public_salon` liefert `staff_prices`, `book_appointment` rechnet Preis und Anzahlung mit der Person, die den Termin bekommt), Tabelle `feedback` (Salons → uns, Mail an `OPERATOR.email` bzw. `FEEDBACK_TO`)
- `0015` Slug `passwort` reserviert
- `0016` Mehrere Leistungen pro Buchung: `book_services(p_services uuid[] …)` (1–4 Leistungen, gleiche Person, Dauer und Preis je Person summiert, Name „A + B“, `appointments.service_ids`), `book_appointment` ruft sie auf; `salon_logo` in `book_services`, `stripe_appointment_paid`, `take_due_reminders` (Logo in Kundenmails, sonst per `public_salon` nachgeladen)
- `0017` Feiertage und Sondertage: `salons.holiday_state` (Bundesland, Good Hair = BW), `public_holidays(state, von, bis)` (inkl. Ostern-Berechnung `easter_sunday`), Tabelle `special_days` (je Tag geschlossen oder eigene Zeit + Hinweis, Mitglieder), `day_intervals(salon, tag)` = Sondertag > Feiertag > Öffnungszeiten; `book_services` prüft damit, `public_salon` liefert `holidays` + `special_days` im Buchungszeitraum
- `0018` Gutscheine: `salons.vouchers_enabled`, Tabellen `vouchers` (Code `TT-XXXX-XXXX`, Token-Link, Betrag/Restwert, pending/active, online/salon, gültig bis Ende des 3. Folgejahres) + `voucher_redemptions`; Stripe-RPCs `stripe_voucher_create/_session/_paid` (Checkout auf dem Connect-Konto, Webhook aktiviert), öffentlich `voucher_by_token`, `salon_vouchers_open`, Mitglieder `voucher_issue/_lookup/_redeem` (Teilbeträge); Slug `gutschein` reserviert
- `0019` `public_salon_slugs()` (öffentlich, Slugs buchbarer Salons für die Sitemap)
- `0020` Automatische Löschung inaktiver Salons: `salon_billing.delete_after`/`delete_notices`/`delete_notice_at`, `purge_salon(id)` (Termine, Salon per cascade, Logins ohne anderen Salon, Bilder), `take_due_deletions(p_key)` (Cron): ohne Zugang Löschung 90 Tage nach Ende von Test/Abo, frühestens 30 Tage nach erster Mail; Mails sofort, 30/7/1 Tag vorher, danach Bestätigung (`sendDeletionNotice`); neues Abo setzt zurück, `exempt` nie
- `0021` `platform_report(p_key, von, bis)` (Cron-Key): Kennzahlen für den Monatsbericht
- `0022` Kunden verschieben selbst: `appointments.reschedule_count` (max. 3), `appointment_by_token` liefert `can_move`/`staff_id`/`duration_min`, `reschedule_by_token(token, start)` (gleiche Person und Dauer, bis 2 h vorher, setzt `reminder_sent_at` zurück); UI `storno/[token]/RescheduleBox.tsx`, Aktionen `rescheduleSlotsAction`/`rescheduleAction`, Mails `sendRescheduleMails` (Kunde + Salon)
- `0010` `salons.logo_url`/`cover_url`, Storage-Bucket `salon-media` (öffentlich lesbar, schreiben nur Mitglieder in `<salon_id>/…`), `public_salon` liefert Logo/Titelbild
- Doppelbuchungen verhindert ein Exclusion-Constraint (`no_double_booking`) auf `appointments.during` je `staff_id`
- Öffentliche Zugriffe nur über Security-Definer-RPCs: `public_salon`, `busy_intervals`, `book_appointment`, `appointment_by_token`, `cancel_by_token`, `take_due_reminders` (Cron-Key in `app_secrets`)
- Neue Migrationen als Datei anlegen **und** im Projekt anwenden; Zeilen nicht löschen, sondern deaktivieren (`active=false`)

## Code-Struktur
- `src/app/page.tsx` Landingpage (Hero, Klagen/Antworten, 3 Schritte, Showcase, Rechner, Preise mit Monat/Jahr, FAQ, „Warum Trimtable?“ mit Logo als erklärtem Stundenplan); Produkt-Ansichten in `src/components/landing/Mockups.tsx` (aus echten Tokens, keine Screenshots/Stockfotos), Rechner/Preiskarte in `Interactive.tsx` · `registrieren/` Selbst-Registrierung · `login/` (mit Passwort vergessen) · `passwort/` neues Passwort setzen
- `src/app/icon.svg`, `apple-icon.tsx`, `opengraph-image.tsx` (Geist-TTF aus `node_modules/geist`)
- `src/app/impressum/`, `datenschutz/`, `agb/` Rechtstexte der Plattform (übernommen von RadsatzPro, Betreiberdaten in `src/lib/operator.ts`); neue Plattform-Routen auch in `slug_available` reservieren
- `src/app/[slug]/` Buchungsseite + `impressum/` + `datenschutz/`
- `src/app/storno/[token]/` Link für Kunden: Termin verschieben (`RescheduleBox`) oder absagen
- `src/app/[slug]/gutschein/` Gutschein online kaufen (`src/app/voucher-actions.ts` → Stripe Checkout), `src/app/gutschein/[token]/` Gutschein ansehen/drucken (Restwert, Code); Mails `sendVoucherMails` an Käufer + Salon
- `src/app/dashboard/` Kalender (Tag/Woche, `_cal/`), `kunden/` Kundenkartei (CSV-Export), `auswertung/` Auswertung (Woche/Monat/Quartal/Jahr: Umsatz erzielt/geplant mit Vergleich zum Vorzeitraum, Termine, Ausfallquote, Neukunden, Umsatz-Verlauf, Auslastung je Person aus Öffnungszeiten inkl. Feiertage/Sondertage, beliebteste Leistungen, Wochentage; reine Client-Auswertung über RLS), `kassieren/` Kartenzahlung per QR-Code (Checkout auf dem Connect-Konto des Salons, `pay-actions.ts`) und Gutscheine (`VoucherSection`: Online-Verkauf an/aus, prüfen, einlösen, ausstellen, Liste), `leistungen/` Einstellungen in 6 Reitern über den URL-Hash (`#salon`, `#leistungen`, `#team`, `#nachrichten`, `#abo`, `#rechtliches`; Links aus Mails/Banner/Stripe auf `#abo`), inkl. Logo/Titelbild (`MediaSection`, im Browser zugeschnitten → WebP), Team-Einladungen, Feiertage & Urlaub (`ClosuresSection`), Preise je Person (`StaffPriceSection`), Push (`PushSection`), Abo/Anzahlung, Buchungslink-QR · Feedback als dezenter Link unten im Dashboard, Fenster per Portal (`Feedback.tsx`)
- `src/app/bezahlt/` Dankeseite nach QR-Zahlung
- `src/components/AuthBackdrop.tsx`: animierter Hintergrund (dunkel Nachthimmel mit Sternschnuppen, hell Seidenfäden; Canvas, reduced motion = Standbild) + `AuthCard` für Login, Registrieren, Storno, Bezahlt, 404
- Fehlerseiten (Prinzip wie RadsatzPro): `not-found.tsx` (404 mit animierter Schere `SnipScene` + Haar-Sprüchen, ohne Drittanbieter-Bilder wegen DSGVO), `error.tsx` (Erneut versuchen/Startseite/Fehler-ID), `global-error.tsx` (eigenes Dokument), `dashboard/error.tsx` (Navigation bleibt); „Melde es uns“ als vorausgefüllte Mail an `OPERATOR.email` (`src/components/ErrorScene.tsx`)
- SEO: `src/lib/site.ts` (`SITE` + schema.org-Bausteine), `JsonLd`-Komponente, Root-Metadaten (Autor/Creator/Publisher „Alpha“), `robots.ts`, `sitemap.ts` (stündlich, Salons per `public_salon_slugs`), HairSalon-JSON-LD auf `/[slug]`; `noindex` für private/Token-Seiten per `X-Robots-Tag` in `next.config.ts`; Footer „Made in Mannheim“ (`MadeInMannheim.tsx`, Quadratestadt-Karte)
- Datenauskunft (Art. 15/20 DSGVO): `src/lib/data-export.ts` (JSON-Download im Browser über RLS) – `exportSalonData` (Einstellungen → `DataSection`), `exportCustomerData` (Kundenkartei → „Auskunft“, ohne Tokens)
- `src/lib/` supabase-Clients, Zeit-/Slot-Logik (`time.ts`, `dayHours`/`dayNote`/`groupDays` für Feiertage und Sondertage), Mails (`mail.ts`, Design in `mail-layout.ts`: helle Karte, Marke oben – Salon mit Logo/Initiale oder Trimtable –, Detail-Panel, ein grüner Knopf, Text-Version automatisch), `salon.ts`, `slug.ts`
- `scripts/auth-templates.ts`: deutsche Supabase-Auth-Mails im selben Design → JSON für `PATCH …/config/auth` (`node scripts/auth-templates.ts`)

## Offen / nächste Schritte
- Good Hair richtet Selda selbst ein und testet selbst – kein To-do für uns, Fokus liegt auf dem Produkt
- Tap to Pay (Karte ans Handy halten) geht nur mit nativer App (Stripe Terminal SDK + Apple-Entitlement), nicht als Web-App; bis dahin Kassieren per QR
- Anzahlung: Kunde stimmt vor Zahlung der Ausfallpauschale zu (Nachweis geringeren Schadens vorbehalten), Zustimmung steht in den Metadaten der Stripe-Session
- trimtable.de: DNS bei netcup (A, www-CNAME, Resend `resend._domainkey`/`send`/`rsend`, ImprovMX-MX + SPF für `@`, `_dmarc` p=none), kontakt@trimtable.de wird per ImprovMX ins Gmail weitergeleitet. Offen: Marke beim DPMA prüfen
- To-do später (zurückgestellt): Live-Kunde „Haarwerk“ `cus_VUjZP4PfnRnATO` im Stripe-Dashboard löschen, Sandbox per „Testdaten löschen“ leeren (Connector kann Kunden/Konten nicht löschen; Sandbox-Abo bereits gekündigt). Echter Testkauf (Gutschein/Anzahlung) steht noch aus
- To-do: **Buchen direkt über Google** (Reserve with Google, Partner-Portal heißt jetzt „Actions Center“): Stand Recherche 11/2026 Beauty/Wellness nur in den USA, UK/Kanada auf Googles Roadmap 2026, Deutschland offen; Partner-Bewerbung (Interessenformular), Feeds für Salons/Leistungen/Verfügbarkeit + Buchungs-Server, Abgleich mit Google-Maps-Einträgen. Bis dahin: Buchungslink manuell im Unternehmensprofil (Profil bearbeiten → Buchungen → Link `trimtable.de/{slug}`, geht nicht per API). Später Anleitung dafür im Dashboard
- Google Search Console (Domain-Property per DNS-TXT) und Bing Webmaster Tools sind eingerichtet, Sitemap eingereicht. Offen: Apple Business Connect/Bing Places für Salons
- Später: SumUp-Terminal statt eigener Kasse (TSE), Supabase Pro (Free pausiert nach 7 Tagen Inaktivität)
