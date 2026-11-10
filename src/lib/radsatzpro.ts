import "server-only";
import { publicClient } from "./supabase";
import { postEvent } from "./radsatzpro-http";

type Claimed = { id: string; salon_id: string; kind: string; payload: Record<string, unknown>; base_url: string; api_key: string; attempts: number };

/** Fällige Ereignisse an RadsatzPro ausliefern. Fehler werden in der Datenbank vermerkt und später wiederholt. */
export async function deliverPendingEvents(limit = 20) {
  const key = process.env.REMINDER_KEY;
  if (!key) return { sent: 0, failed: 0, skipped: "REMINDER_KEY fehlt" };
  const db = publicClient();
  const { data, error } = await db.rpc("take_integration_events", { p_key: key, p_limit: limit });
  if (error) {
    console.error("take_integration_events failed", error.message);
    return { sent: 0, failed: 0, skipped: "Abholung fehlgeschlagen" };
  }
  let sent = 0;
  let failed = 0;
  // der Reihe nach, damit Ereignisse eines Termins in der richtigen Reihenfolge ankommen
  for (const ev of (data ?? []) as Claimed[]) {
    const r = await postEvent(ev.base_url, ev.api_key, ev.id, ev.payload);
    const { error: e2 } = await db.rpc("integration_event_result", { p_key: key, p_event: ev.id, p_ok: r.ok, p_error: r.ok ? null : r.error });
    if (e2) console.error("integration_event_result failed", e2.message);
    if (r.ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
