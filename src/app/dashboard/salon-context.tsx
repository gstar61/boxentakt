"use client";

import { createContext, useContext } from "react";
import type { Holiday, Hours, SpecialDay } from "@/lib/time";

export type Salon = {
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
  owner_email: string;
  timezone: string;
  slot_step: number;
  booking_days: number;
  logo_url: string | null;
  google_review_url: string | null;
  cover_url: string | null;
  deposit_percent: number;
  holiday_state: string | null;
  vouchers_enabled: boolean;
  /** Zuschlag je Fahrzeugklasse (Minuten, Cent) */
  class_extra: Record<"pkw" | "suv" | "transporter", { min: number; cents: number }>;
};
export type Staff = { id: string; name: string; active: boolean; sort: number };
export type ResourceKind = "buehne" | "wuchtmaschine" | "sonstige";
export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = { buehne: "Hebebühne", wuchtmaschine: "Wuchtmaschine", sonstige: "Sonstiger Platz" };
export type Resource = { id: string; name: string; kind: ResourceKind; active: boolean; sort: number };
export type Service = { id: string; name: string; duration_min: number; price_cents: number; active: boolean; sort: number; rebook_weeks: number | null; resource_kind: ResourceKind | null };

export type StaffPrice = { staff_id: string; service_id: string; price_cents: number };

/** Price of a service with a given person; falls back to the service price. */
export const priceWith = (service: Pick<Service, "id" | "price_cents">, staffId: string | null, prices: StaffPrice[]) =>
  prices.find((p) => p.service_id === service.id && p.staff_id === staffId)?.price_cents ?? service.price_cents;

export type SalonCtx = {
  salon: Salon;
  staff: Staff[];
  services: Service[];
  resources: Resource[];
  staffPrices: StaffPrice[];
  hours: Hours[];
  /** public holidays and special days (closed / other hours) around today */
  closures: { holidays: Holiday[]; special_days: SpecialDay[] };
  role: "owner" | "staff";
  userId: string;
  reload: () => Promise<void>;
};

export const SalonContext = createContext<SalonCtx | null>(null);
export const useSalon = () => {
  const c = useContext(SalonContext);
  if (!c) throw new Error("SalonContext missing");
  return c;
};
