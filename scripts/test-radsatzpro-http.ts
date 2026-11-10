// Test des HTTP-Teils der RadsatzPro-Schnittstelle gegen einen Fake-Server.
// Aufruf: npm run test:radsatz   (Node >= 22.6, nutzt --experimental-strip-types)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { lookupWheelsets, pingRadsatzpro, postEvent, safeBaseUrl } from "../src/lib/radsatzpro-http.ts";

const KEY = "test-key-0123456789abcdef";
const seen: { method: string; url: string; auth?: string; idem?: string; body?: unknown }[] = [];

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    seen.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, idem: req.headers["idempotency-key"] as string | undefined, body: raw ? JSON.parse(raw) : undefined });
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "unauthorized" });
    const u = new URL(req.url ?? "/", "http://x");
    if (u.pathname === "/api/integration/boxentakt/ping") return send(200, { ok: true, workshop: "Reifen Meier" });
    if (u.pathname === "/api/integration/boxentakt/events") {
      const b = JSON.parse(raw);
      if (b.appointment?.license_plate === "SERVER-FEHLER") return send(500, {});
      if (b.appointment?.license_plate === "UMLEITUNG") {
        res.writeHead(302, { location: "http://127.0.0.1:1/evil" });
        return res.end();
      }
      return send(200, { ok: true });
    }
    if (u.pathname === "/api/integration/boxentakt/wheelsets") {
      const plate = u.searchParams.get("plate");
      if (plate === "MA-AB 123")
        return send(200, { found: true, vehicle: { plate: "MA-AB 123", model: "VW Golf" }, wheelsets: [{ id: "w1", season: "Winter", location: "B3", brand: "Conti", size: "205/55 R16", stored_until: "2027-04-30", article_type: "Radsatz" }] });
      return send(200, { found: false, vehicle: null, wheelsets: [] });
    }
    return send(404, {});
  });
});

await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

try {
  // Adressprüfung
  assert.equal(safeBaseUrl("https://radsatzpro.de/"), "https://radsatzpro.de");
  assert.equal(safeBaseUrl("http://localhost:3001"), "http://localhost:3001");
  assert.equal(safeBaseUrl("http://example.com"), null, "http außer localhost");
  assert.equal(safeBaseUrl("https://10.0.0.5"), null, "IP-Adresse");
  assert.equal(safeBaseUrl("https://127.0.0.1"), null, "IP-Adresse");
  assert.equal(safeBaseUrl("https://localhost"), null, "kein Domainname mit Punkt");
  assert.equal(safeBaseUrl("javascript:alert(1)"), null);

  // Ping
  assert.deepEqual(await pingRadsatzpro(base, KEY), { ok: true, name: "Reifen Meier" });
  const bad = await pingRadsatzpro(base, "falscher-schluessel-xxxxx");
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.error, /nicht akzeptiert/);

  // Ereignis: Header, Idempotenz, Körper
  const ok = await postEvent(base, KEY, "evt-1", { event: "appointment.created", appointment: { id: "a1", license_plate: "MA-AB 123" } });
  assert.deepEqual(ok, { ok: true });
  const last = seen.at(-1)!;
  assert.equal(last.method, "POST");
  assert.equal(last.idem, "evt-1");
  assert.equal((last.body as { event_id: string }).event_id, "evt-1");
  assert.ok((last.body as { sent_at: string }).sent_at);

  const fail = await postEvent(base, KEY, "evt-2", { appointment: { license_plate: "SERVER-FEHLER" } });
  assert.deepEqual(fail, { ok: false, error: "HTTP 500" });

  // Weiterleitungen werden nicht verfolgt
  const redir = await postEvent(base, KEY, "evt-3", { appointment: { license_plate: "UMLEITUNG" } });
  assert.equal(redir.ok, false);

  // ungültige Adresse wird nie angefragt
  const before = seen.length;
  assert.equal((await postEvent("https://10.0.0.5", KEY, "evt-4", {})).ok, false);
  assert.equal(seen.length, before);

  // Radsatz-Abfrage
  const hit = await lookupWheelsets(base, KEY, "MA-AB 123");
  assert.ok(hit.ok && hit.found && hit.wheelsets[0].location === "B3");
  const miss = await lookupWheelsets(base, KEY, "XX-YY 1");
  assert.ok(miss.ok && !miss.found && miss.wheelsets.length === 0);
  assert.equal(seen.at(-1)!.url, "/api/integration/boxentakt/wheelsets?plate=XX-YY%201", "Kennzeichen wird kodiert");
  const denied = await lookupWheelsets(base, "falscher-schluessel-xxxxx", "MA-AB 123");
  assert.equal(denied.ok, false);

  console.log("test-radsatzpro-http: alle Prüfungen bestanden");
} finally {
  server.close();
}
