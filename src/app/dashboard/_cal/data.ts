import { browserClient } from "@/lib/supabase";
import { parseRange, type Busy, type ResourceBusy } from "@/lib/time";
import type { Resource, ResourceKind } from "../salon-context";

export type Status = "gebucht" | "erschienen" | "nicht_erschienen" | "storniert";
export type Appt = {
  id: string;
  staff_id: string;
  customer_id: string;
  service_id: string | null;
  service_name: string;
  price_cents: number;
  start: Date;
  end: Date;
  status: Status;
  source: "online" | "salon";
  note: string | null;
  resource_id: string | null;
  license_plate: string | null;
  vehicle_class: "pkw" | "suv" | "transporter";
  vehicle_info: string | null;
  deposit_cents: number | null;
  payment_status: "pending" | "paid" | "refunded" | "expired" | null;
  customer: { name: string; phone: string | null; email: string | null; note: string | null } | null;
};
export type Absence = { id: string; staff_id: string | null; start: Date; end: Date; reason: string | null };

export const PAYMENT_LABEL = { pending: "offen", paid: "bezahlt", refunded: "erstattet", expired: "nicht bezahlt" } as const;

export const STATUS_LABEL: Record<Status, string> = {
  gebucht: "Gebucht",
  erschienen: "Erschienen",
  nicht_erschienen: "Nicht erschienen",
  storniert: "Storniert",
};

const range = (from: Date, to: Date) => `[${from.toISOString()},${to.toISOString()})`;

/** Appointments and absences overlapping [from, to). */
export async function loadRange(salonId: string, from: Date, to: Date) {
  const sb = browserClient();
  const [a, b] = await Promise.all([
    sb
      .from("appointments")
      .select("id,staff_id,customer_id,service_id,service_name,price_cents,during,status,source,note,resource_id,license_plate,vehicle_class,vehicle_info,deposit_cents,payment_status,payment_expires_at,customers(name,phone,email,note)")
      .eq("salon_id", salonId)
      .filter("during", "ov", range(from, to)),
    sb.from("absences").select("id,staff_id,during,reason").eq("salon_id", salonId).filter("during", "ov", range(from, to)),
  ]);
  if (a.error || b.error) throw a.error ?? b.error;
  const appts = (a.data ?? []).map((r: unknown) => {
    const row = r as Omit<Appt, "start" | "end" | "customer"> & { during: string; payment_expires_at: string | null; customers: Appt["customer"] };
    const [start, end] = parseRange(row.during);
    // unpaid deposit hold that ran out: the slot is free again
    const lapsed = row.payment_status === "pending" && row.payment_expires_at !== null && Date.parse(row.payment_expires_at) < Date.now();
    return { ...row, status: lapsed ? "storniert" : row.status, start, end, customer: row.customers } as Appt;
  });
  const absences = (b.data ?? []).map((r: unknown) => {
    const row = r as Omit<Absence, "start" | "end"> & { during: string };
    const [start, end] = parseRange(row.during);
    return { id: row.id, staff_id: row.staff_id, reason: row.reason, start, end } as Absence;
  });
  return { appts, absences };
}

/** Busy intervals per person (active appointments + absences), optionally ignoring one appointment. */
export function busyFor(appts: Appt[], absences: Absence[], staffIds: string[], ignoreId?: string): Busy[] {
  const out: Busy[] = appts
    .filter((a) => a.status !== "storniert" && a.id !== ignoreId)
    .map((a) => ({ staff_id: a.staff_id, starts_at: a.start.toISOString(), ends_at: a.end.toISOString() }));
  for (const ab of absences)
    for (const id of ab.staff_id ? [ab.staff_id] : staffIds)
      out.push({ staff_id: id, starts_at: ab.start.toISOString(), ends_at: ab.end.toISOString() });
  return out;
}

/** Same normalisation as customers.phone_norm in the database. */
export const normPhone = (s: string) => s.replace(/\D/g, "").replace(/^(00)?49/, "0");

/** Belegte Zeiten der Plätze (aktive Termine mit Platz), optional ohne einen Termin. */
export function busyPlaces(appts: Appt[], ignoreId?: string): ResourceBusy[] {
  return appts
    .filter((a) => a.status !== "storniert" && a.id !== ignoreId && a.resource_id)
    .map((a) => ({ resource_id: a.resource_id as string, starts_at: a.start.toISOString(), ends_at: a.end.toISOString() }));
}

/**
 * Freien Platz der gewünschten Art für [start, end) finden.
 * `undefined` = keine Platzprüfung (Leistung braucht keinen oder der Betrieb hat keinen Platz dieser Art), `null` = alle belegt.
 */
export async function pickPlace(resources: Resource[], kind: ResourceKind | null | undefined, start: Date, end: Date, ignoreId?: string): Promise<string | null | undefined> {
  const ids = kind ? resources.filter((r) => r.active && r.kind === kind).sort((a, b) => a.sort - b.sort).map((r) => r.id) : [];
  if (!ids.length) return undefined;
  const { data, error } = await browserClient()
    .from("appointments")
    .select("id,resource_id")
    .in("resource_id", ids)
    .neq("status", "storniert")
    .filter("during", "ov", range(start, end));
  if (error) throw error;
  const taken = new Set((data ?? []).filter((r: { id: string }) => r.id !== ignoreId).map((r: { resource_id: string }) => r.resource_id));
  return ids.find((id) => !taken.has(id)) ?? null;
}

export const PLACE_FULL = "Alle Plätze dieser Art sind zu dieser Zeit belegt.";
