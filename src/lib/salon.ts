import "server-only";
import { cache } from "react";
import { publicClient } from "./supabase";
import type { Holiday, Hours, SpecialDay } from "./time";

export type PublicSalon = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  notice: string | null;
  legal_name: string | null;
  contact_email: string | null;
  vat_id: string | null;
  legal_extra: string | null;
  timezone: string;
  slot_step: number;
  booking_days: number;
  logo_url: string | null;
  cover_url: string | null;
  /** subscription/trial active (or exempt); otherwise no online booking */
  bookable: boolean;
  /** effective deposit in percent of the price, 0 = none */
  deposit_percent: number;
  staff: { id: string; name: string }[];
  services: { id: string; name: string; duration_min: number; price_cents: number; resource_kinds: ("buehne" | "wuchtmaschine" | "sonstige")[]; /** differing prices per staff id */ staff_prices?: Record<string, number> }[];
  hours: Hours[];
  /** Planungsart: nach Plätzen (Standard) oder nach Mitarbeitern */
  planning: "plaetze" | "mitarbeiter";
  /** aktive Plätze (Hebebühne …); Belegung kommt aus busy_resources */
  resources: { id: string; kind: "buehne" | "wuchtmaschine" | "sonstige"; name: string }[];
  /** Zuschlag je Fahrzeugklasse (Minuten, Cent) */
  class_extra: Record<"pkw" | "suv" | "transporter", { min: number; cents: number }>;
  holiday_state: string | null;
  holidays: Holiday[];
  special_days: SpecialDay[];
};

/** Public salon data by slug, deduplicated per request. */
export const loadSalon = cache(async (slug: string) => {
  const { data } = await publicClient().rpc("public_salon", { p_slug: slug });
  // fields added later may be missing in older responses
  const s = data as PublicSalon | null;
  return s ? { ...s, holidays: s.holidays ?? [], special_days: s.special_days ?? [], holiday_state: s.holiday_state ?? null, resources: s.resources ?? [], class_extra: s.class_extra ?? { pkw: { min: 0, cents: 0 }, suv: { min: 0, cents: 0 }, transporter: { min: 0, cents: 0 } } } : null;
});
