"use server";

import { publicClient, userClient } from "@/lib/supabase";
import { deliverPendingEvents } from "@/lib/radsatzpro";
import { lookupWheelsets, pingRadsatzpro, type Wheelset } from "@/lib/radsatzpro-http";

export type RadsatzLookup =
  | { state: "off" }
  | { state: "noplate" }
  | { state: "none" }
  | { state: "found"; wheelsets: Wheelset[] }
  | { state: "error"; message: string };

async function memberId(accessToken: string) {
  const { data } = await userClient(String(accessToken)).auth.getUser(String(accessToken));
  return data.user?.id ?? null;
}

/** Radsätze zum Kennzeichen eines Termins aus RadsatzPro holen (nur für Mitglieder des Betriebs). */
export async function lookupRadsatz(accessToken: string, appointmentId: string): Promise<RadsatzLookup> {
  const uid = await memberId(accessToken);
  const key = process.env.REMINDER_KEY;
  if (!uid || !key) return { state: "off" };
  const { data } = await publicClient().rpc("integration_for_member", { p_key: key, p_user: uid, p_appt: String(appointmentId) });
  const c = data as { base_url: string; api_key: string; license_plate: string | null } | null;
  if (!c) return { state: "off" };
  if (!c.license_plate) return { state: "noplate" };
  const r = await lookupWheelsets(c.base_url, c.api_key, c.license_plate);
  if (!r.ok) return { state: "error", message: r.error };
  return r.found && r.wheelsets.length ? { state: "found", wheelsets: r.wheelsets } : { state: "none" };
}

/** Verbindung testen (nur Inhaber: die Zeile ist per RLS nur für sie lesbar). */
export async function testRadsatz(accessToken: string, salonId: string) {
  const { data } = await userClient(String(accessToken))
    .from("salon_integrations")
    .select("base_url,api_key")
    .eq("salon_id", String(salonId))
    .maybeSingle();
  const c = data as { base_url: string; api_key: string } | null;
  if (!c) return { ok: false as const, error: "Bitte zuerst speichern." };
  return pingRadsatzpro(c.base_url, c.api_key);
}

/** Wartende Ereignisse sofort ausliefern, nach Änderungen im Dashboard. */
export async function flushIntegrationEvents(accessToken: string) {
  if (!(await memberId(accessToken))) return { sent: 0, failed: 0 };
  return deliverPendingEvents(10);
}
