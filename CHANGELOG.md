# Änderungsprotokoll

Was in Trimtable (vormals Salonbuch) gebaut wurde, nach Datum. Technische Details stehen in `CLAUDE.md`, der Betrieb (Domain, DNS, Mails, Stripe) in [`docs/betrieb.md`](docs/betrieb.md).

## 27.10.2026 – Suchmaschinen und Fehlerseiten

- **SEO**: Titel, Beschreibung, Keywords, Autor/Herausgeber „Alpha“, Open Graph/Twitter, `robots.txt`, `sitemap.xml` (inkl. aller buchbaren Salons), strukturierte Daten (Organization, WebSite, SoftwareApplication mit Preisen, FAQ; auf Buchungsseiten HairSalon mit Öffnungszeiten und Leistungen)
- Private und Token-Seiten (Dashboard, Storno, Gutschein, Abmelden, Bezahlt, Passwort) mit `noindex`
- Footer: „Made in Mannheim“ mit kleiner Quadratestadt-Karte
- Eigene Fehlerseiten: 404 mit animierter Schere, Fehlerseite mit Fehler-ID und „Melde es uns“

## 25.10.2026 – Trimtable

### Buchung
- **Mehrere Leistungen in einer Buchung** (bis zu 4, z. B. Schnitt + Farbe): Dauer und Preis je Person werden addiert
- **Feiertage je Bundesland** sind online automatisch geschlossen, **Urlaub und Sondertage** (geschlossen oder andere Öffnungszeit, z. B. Heiligabend) unter Einstellungen; Buchungsseite zeigt abweichende Zeiten, Kalender markiert die Tage
- Kundenmails zeigen das Salon-Logo

### Gutscheine
- **Gutscheine online verkaufen** unter `/{salon}/gutschein` (25–100 € oder eigener Betrag, Nachricht, Empfänger), Zahlung direkt an den Salon über Stripe, Gutschein per Mail und als Druckseite
- Im Dashboard unter Kassieren: Gutscheine im Salon ausstellen, Code prüfen, in Teilbeträgen einlösen, Übersicht mit Restwerten

### Auswertung
- Neue Seite **Auswertung** im Dashboard: Umsatz (erzielt und geplant) mit Vergleich zum Vorzeitraum, Termine, Online-Anteil, Ausfallquote, neue Kunden, Umsatz-Verlauf, Auslastung je Person, beliebteste Leistungen und Termine nach Wochentag – für Woche, Monat, Quartal oder Jahr

### Marke und Domain
- Umbenennung von Salonbuch in **Trimtable** (Trim + Timetable), Slogan **„Termine ohne Haarspalterei.“** (`src/lib/brand.ts`)
- Neues Logo: 3×3-Stundenplan mit einem belegten und einem vergangenen Feld – Favicon, App-Symbol, Social-Vorschau, Kopfzeilen, Login und Platzhalter für Salons ohne eigenes Logo
- Eigene Domain **trimtable.de** (www leitet weiter), alle Links in Mails und bei Stripe zeigen dorthin; salonbuch.vercel.app bleibt erreichbar
- Stripe-Produkt und Kundenportal heißen Trimtable, Datenschutz/AGB/Rücksprung auf trimtable.de
- GitHub-Repo umbenannt in `gstar61/Trimtable`, README neu

### Mails
- Versand über **Resend** mit eigener Domain, Absender `termine@trimtable.de` (Anzeigename = Salon), Antworten gehen an den Salon
- Einheitliches Mail-Design passend zur Website (`src/lib/mail-layout.ts`): helle Karte, Absender oben, Detail-Feld, ein grüner Knopf, Text-Version automatisch
- Deutsche Supabase-Mails (Passwort, Registrierung, E-Mail ändern, Einladung, Anmeldelink) im selben Design (`scripts/auth-templates.ts`)
- Postfach `kontakt@trimtable.de` (plus `termine@`, `support@`, `datenschutz@`, `rechnung@`) per Weiterleitung

### Für Salons
- **Preise je Person**: abweichender Preis pro Mitarbeiter und Leistung; Buchungsseite zeigt den Preis der gewählten Person, Preis und Anzahlung richten sich nach der Person, die den Termin bekommt
- **Push aufs Handy** bei jeder Online-Buchung, Trimtable als App installierbar (PWA)
- **Feedback-Knopf** im Dashboard (Idee, Problem, Lob) – gespeichert und per Mail an uns
- **Warteliste** für ausgebuchte Tage: wird ein Termin frei, bekommen alle Wartenden eine Mail
- **Bewertungsbitte** bei Google am Tag nach dem ersten Termin und **Erinnerung an den nächsten Termin** nach X Wochen, mit Abmeldelink
- **Passwort vergessen** mit Reset-Link und eigener Seite zum Setzen
- Login und Registrierung mit Weg zurück zur Startseite, animierter Hintergrund (Nachthimmel dunkel, Seidenfäden hell)

## 23.10.2026 – Salonbuch

### Grundlagen
- Öffentliche Buchungsseite je Salon ohne Kundenkonto, Absage-Link, Bestätigungs- und Erinnerungsmails
- Kalender (Tag/Woche), Termine eintragen und verschieben, Abwesenheiten, Kundenkartei mit Stammkunden-Erkennung und CSV-Export
- Öffnungszeiten mit Pause, Hinweistext, ab-Preise, Spam-Schutz, Impressum und Datenschutz je Salon
- Doppelbuchungen verhindert die Datenbank selbst

### SaaS
- Landingpage, Selbst-Registrierung mit Salon-Anlage, Team-Einladungen, mehrere Salons je Konto
- Impressum, Datenschutz und AGB der Plattform
- Helles und dunkles Design nach Systemeinstellung, Umschalter
- Landingpage neu: Produkt-Ansichten aus echten Komponenten, Ersparnis-Rechner, Preise, FAQ
- Logo und Titelbild je Salon

### Bezahlen
- Abo über Stripe: 29 € im Monat oder 290 € im Jahr, 30 Tage Test, Hinweis nach § 19 UStG auf Rechnungen
- Optionale **Anzahlung** bei Online-Buchung über Stripe Connect direkt an den Salon, mit Zustimmung zur Ausfallregel, automatische Erstattung bei Absage bis 24 Stunden vorher
- **Kassieren per QR-Code** im Salon (Kartenzahlung am Handy des Kunden)
