# Schnittstelle Boxentakt ↔ RadsatzPro

RadsatzPro bleibt führend für Kunde, Fahrzeug und Radsatz, Boxentakt für Termine und Kapazität. Es gibt keine gemeinsame Datenbank, nur diese HTTPS-Schnittstelle. Boxentakt ruft RadsatzPro auf, nie umgekehrt.

## Verbindung je Betrieb

- In RadsatzPro erzeugt der Geschäftsführer unter Einstellungen → Boxentakt einen **Schlüssel** (wird nur einmal angezeigt, in RadsatzPro nur als Hash gespeichert, jederzeit neu erzeugbar). Der Schlüssel gehört zu genau einer Werkstatt.
- In Boxentakt trägt der Inhaber unter Einstellungen → Betrieb die **Adresse** (`https://…`, ohne Pfad) und den Schlüssel ein (Tabelle `salon_integrations`, nur für Inhaber lesbar).
- Alle Aufrufe tragen `Authorization: Bearer <Schlüssel>`. RadsatzPro leitet daraus die Werkstatt ab und liest nie eine `werkstatt_id` aus der Anfrage.
- Erlaubt sind nur https-Adressen mit Domainname (keine IP-Adressen); zum Entwickeln `http://localhost`. Weiterleitungen werden nicht verfolgt, Zeitlimit 8 Sekunden.

## 1. Termin-Ereignisse (Boxentakt → RadsatzPro)

`POST {Adresse}/api/integration/boxentakt/events`

Header: `Authorization`, `Content-Type: application/json`, `Idempotency-Key: <event_id>`

```json
{
  "event_id": "uuid",
  "sent_at": "2026-11-16T09:00:01Z",
  "occurred_at": "2026-11-16T09:00:00Z",
  "event": "appointment.created | appointment.updated | appointment.cancelled",
  "appointment": {
    "id": "uuid (Termin in Boxentakt)",
    "status": "gebucht | erschienen | nicht_erschienen | storniert",
    "starts_at": "ISO-8601 UTC",
    "ends_at": "ISO-8601 UTC",
    "service_name": "Räderwechsel (Sommer/Winter)",
    "license_plate": "MA-AB 123 | null",
    "vehicle_class": "pkw | suv | transporter",
    "vehicle_info": "VW Golf | null",
    "note": "Hinweis des Kunden | null",
    "place": "Hebebühne 1 | null",
    "source": "online | salon"
  },
  "customer": { "name": "…", "phone": "…", "email": "… | null" }
}
```

Antwort `200 {"ok": true}`. Alles andere zählt als Fehler und wird wiederholt (alle 15 Minuten mal Versuch, nach 8 Versuchen wird aufgegeben und im Betrieb als „aufgegeben“ angezeigt).

Erwartetes Verhalten von RadsatzPro:
- **Idempotent** über `Idempotency-Key` bzw. `appointment.id`: ein Ereignis zweimal zu bekommen darf nichts doppelt anlegen.
- **Reihenfolge** über `occurred_at`: ältere Ereignisse zu einem Termin als das zuletzt verarbeitete werden ignoriert (trotzdem `200`).
- `created` und `updated` legen den Termin an bzw. aktualisieren ihn (Schlüssel: Boxentakt-Termin-ID), `cancelled` setzt ihn auf storniert. Ein `cancelled` zu einem unbekannten Termin ist kein Fehler (`200`).
- Kunde: in der Werkstatt per E-Mail oder Telefon suchen, sonst neu anlegen. Fahrzeug: nur verknüpfen, wenn das Kennzeichen (normalisiert) in dieser Werkstatt schon existiert; Fahrzeuge werden nicht automatisch angelegt. Kennzeichen steht zusätzlich als Text im Termin.
- Nach `401` (Schlüssel ungültig) keine Details preisgeben.

## 2. Radsatz zum Kennzeichen (Boxentakt → RadsatzPro)

`GET {Adresse}/api/integration/boxentakt/wheelsets?plate=MA-AB%20123`

```json
{
  "found": true,
  "vehicle": { "plate": "MA-AB 123", "model": "VW Golf" },
  "wheelsets": [
    { "id": "uuid", "season": "Winter", "location": "Halle 1 / Regal B / Fach 3",
      "brand": "Conti", "size": "205/55 R16", "stored_until": "2027-04-30", "article_type": "Radsatz" }
  ]
}
```

- Nur aktive Einlagerungen (nicht ausgelagert) der Werkstatt des Schlüssels.
- Kennzeichen normalisiert vergleichen (Großbuchstaben, ohne Leerzeichen und Bindestriche).
- Keine Treffer: `200 {"found": false, "vehicle": null, "wheelsets": []}`.
- Abgefragt wird nur im Dashboard auf Klick eines Mitarbeiters, nie auf der öffentlichen Buchungsseite (sonst ließe sich über das Kennzeichen erfragen, wer Räder eingelagert hat).

## 3. Verbindung prüfen

`GET {Adresse}/api/integration/boxentakt/ping` → `200 {"ok": true, "workshop": "Name der Werkstatt"}`

## Datenschutz

An RadsatzPro gehen Name, Telefon, E-Mail, Kennzeichen und Termindaten des Kunden. Beide Produkte betreibt derselbe Anbieter; die Verbindung wird vom Betrieb selbst eingerichtet und ist jederzeit trennbar (Einstellungen → Betrieb → Trennen). Datenschutzerklärung und Auftragsverarbeitung vor dem Echtbetrieb entsprechend ergänzen.

## Boxentakt-Seite

- Migration `0026_integrations.sql`: Tabellen `salon_integrations` und `integration_events`, Trigger auf `appointments`, Funktionen `take_integration_events`, `integration_event_result`, `integration_for_member`.
- `src/lib/radsatzpro-http.ts` (Aufrufe) und `src/lib/radsatzpro.ts` (Auslieferung). Ausgeliefert wird nach jeder Buchung, Absage, Verschiebung und Dashboard-Änderung sofort (`after()`), liegengebliebene Ereignisse versucht der tägliche Cron in `/api/cron/reminders` erneut.
- Tests: `supabase/tests/integration.sql` (Datenbank) und `npm run test:radsatz` (HTTP gegen Fake-Server, Node ≥ 22.6).
