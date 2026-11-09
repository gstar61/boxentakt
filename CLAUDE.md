@AGENTS.md

# Boxentakt – Projektkontext

Online-Terminbuchung + Kalender für Werkstätten (Reifen/Räderwechsel, freie Kfz-Werkstätten, Autohäuser/Flotten, später weitere Branchen). Slogan **„Termine im Takt.“** (`src/lib/brand.ts`). Domain geplant: **boxentakt.de** (frei geprüft, noch nicht registriert).

## Herkunft
Start als Kopie des Codes von **Trimtable** (Friseur-Buchung, Repo `gstar61/Trimtable`). Trimtable bleibt unverändert und eigenständig. Boxentakt hat eigenes Repo, **eigenes Supabase-Projekt, eigenes Vercel-Projekt, eigene Stripe-Produkte und eigene Resend-Domain** – nichts davon mit Trimtable teilen. Migrationen niemals auf das Trimtable-Supabase-Projekt anwenden.

## Stand
- Marke, Domain-Texte und Slogan sind auf Boxentakt umbenannt.
- Fachlich ist der Code noch **Friseur** (Tabellen `salons`, `staff`, Texte „Salon“, Schere im 404, Haar-Sprüche, Gutscheine, Preise je Person). Das wird schrittweise zu Betrieb/Standort/Ressource/Fahrzeug umgebaut.
- Infrastruktur (Supabase, Vercel, Stripe, Resend, DNS) ist noch **nicht** angelegt. Env-Variablen siehe README.

## Geplanter Umbau
1. Begriffe: Salon → Betrieb, Personal → Ressourcen (Mechaniker, Hebebühne, Wuchtmaschine); Termin kann mehrere Ressourcen belegen, Doppelbuchungs-Schutz je Ressource.
2. Fahrzeug im Termin: Kennzeichen, Fahrzeugklasse (Dauer je Klasse), optional Reifengröße.
3. Leistungskatalog Werkstatt (Räderwechsel mit/ohne Einlagerung, Öl, Inspektion, HU/AU, Bremsen, Batterie, Klima, Achsvermessung).
4. Standorte und Flotten-Sammeltermine.
5. Friseur-Teile entfernen (Haar-Motive, Preise je Person, Friseur-Gutscheine).
6. Anbindung an RadsatzPro (nach dem eigenständigen Start): API-Schlüssel + Webhooks, RadsatzPro bleibt führend für Kunde/Fahrzeug/Radsatz, Boxentakt für Termine/Kapazität. Keine gemeinsame Datenbank.
7. Google/SEO: Buchungslink im Unternehmensprofil, schema.org `AutoRepair`, Städteseiten.

## Zusammenarbeit
- Antworten auf Deutsch, kurz, konkrete Lösung statt langer Herleitung.
- Endkunden **Sie**, alles für Betriebe **du**.
- Vor dem Commit: `npx tsc --noEmit && npx eslint src && npm run build`
- Commits mit `gstar61 <gstar61@users.noreply.github.com>`
