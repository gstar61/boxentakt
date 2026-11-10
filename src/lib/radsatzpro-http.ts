/** HTTP-Anteil der RadsatzPro-Schnittstelle (ohne Datenbankzugriff, damit er sich einzeln testen lässt). */

export type Wheelset = {
  id: string;
  season: string | null;
  location: string | null;
  brand: string | null;
  size: string | null;
  stored_until: string | null;
  article_type: string | null;
};
export type LookupResult = { ok: true; found: boolean; vehicle: { plate: string; model: string | null } | null; wheelsets: Wheelset[] } | { ok: false; error: string };

const TIMEOUT_MS = 8000;

/** Nur https mit Domainname (keine IP-Adressen), zum Entwickeln auch http://localhost. Gibt die Basis ohne Schrägstrich am Ende zurück. */
export function safeBaseUrl(raw: string): string | null {
  const u = String(raw ?? "").trim().replace(/\/+$/, "");
  const https = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{2,5})?$/.test(u) && !/^https:\/\/[0-9.]+(:|$)/.test(u);
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]{2,5})?$/.test(u);
  return https || local ? u : null;
}

async function call(base: string, path: string, key: string, init: { method: "GET" | "POST"; body?: unknown; eventId?: string }) {
  const url = safeBaseUrl(base);
  if (!url) return { ok: false as const, status: 0, error: "Ungültige Adresse der Verbindung" };
  try {
    const res = await fetch(`${url}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.eventId ? { "Idempotency-Key": init.eventId } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false as const, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true as const, status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch (e) {
    return { ok: false as const, status: 0, error: e instanceof Error ? e.message.slice(0, 120) : "Verbindungsfehler" };
  }
}

/** Ein Termin-Ereignis an RadsatzPro senden. Wiederholungen und Aufgeben (nach 8 Versuchen) regelt die Datenbank. */
export async function postEvent(base: string, key: string, eventId: string, payload: Record<string, unknown>) {
  const r = await call(base, "/api/integration/boxentakt/events", key, {
    method: "POST",
    eventId,
    body: { event_id: eventId, sent_at: new Date().toISOString(), ...payload },
  });
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

/** Radsätze zum Kennzeichen abfragen. */
export async function lookupWheelsets(base: string, key: string, plate: string): Promise<LookupResult> {
  const r = await call(base, `/api/integration/boxentakt/wheelsets?plate=${encodeURIComponent(plate)}`, key, { method: "GET" });
  if (!r.ok) return { ok: false, error: r.status === 401 || r.status === 403 ? "Schlüssel wird von RadsatzPro nicht akzeptiert" : r.error };
  const j = r.json as { found?: boolean; vehicle?: { plate: string; model: string | null } | null; wheelsets?: Wheelset[] };
  return { ok: true, found: Boolean(j.found), vehicle: j.vehicle ?? null, wheelsets: Array.isArray(j.wheelsets) ? j.wheelsets.slice(0, 10) : [] };
}

/** Verbindung prüfen. */
export async function pingRadsatzpro(base: string, key: string) {
  const r = await call(base, "/api/integration/boxentakt/ping", key, { method: "GET" });
  if (r.ok) return { ok: true as const, name: typeof r.json.workshop === "string" ? r.json.workshop : null };
  return { ok: false as const, error: r.status === 401 || r.status === 403 ? "Schlüssel wird von RadsatzPro nicht akzeptiert" : r.error };
}
