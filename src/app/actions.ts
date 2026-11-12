"use server";

import { after } from "next/server";
import { publicClient } from "@/lib/supabase";
import { deliverPendingEvents } from "@/lib/radsatzpro";
import { appUrl, sendBookingMails, sendRescheduleMails, type Booked, type Rescheduled } from "@/lib/mail";
import { pushNewBooking } from "@/lib/push";
import { stripe, stripeReady, stripeRpc } from "@/lib/stripe";
import { addDays, freeSlots, fullDateTime, placeGroups, zonedDate, type Busy, type ResourceBusy } from "@/lib/time";
import { loadSalon } from "@/lib/salon";
import { notifyWaitlist } from "@/lib/waitlist";

export type BookInput = {
  slug: string;
  /** one to four services, booked back to back with the same person */
  serviceIds: string[];
  staffId: string | null;
  start: string;
  name: string;
  phone: string;
  email: string;
  note: string;
  /** Kennzeichen, Fahrzeugklasse (pkw/suv/transporter) und Fahrzeughinweis */
  plate: string;
  vehicleClass: string;
  vehicleInfo?: string;
  /** honeypot, must stay empty */
  website?: string;
  /** consent to the cancellation terms, required when a deposit is due */
  acceptedTerms?: boolean;
  /** time between opening the page and submitting */
  elapsedMs?: number;
};

const MESSAGES: Record<string, string> = {
  slot_taken: "Diese Zeit wurde gerade vergeben. Bitte eine andere wählen.",
  closed: "Zu dieser Zeit ist die Werkstatt geschlossen.",
  outside_window: "Diese Zeit kann nicht mehr online gebucht werden.",
  invalid_name: "Bitte den vollständigen Namen eintragen.",
  invalid_phone: "Bitte eine gültige Telefonnummer eintragen.",
  invalid_email: "Die E-Mail-Adresse sieht nicht richtig aus.",
  invalid_time: "Ungültige Uhrzeit.",
  service_not_found: "Diese Leistung gibt es nicht mehr.",
  salon_not_found: "Werkstatt nicht gefunden.",
  too_many: "Mit dieser Telefonnummer sind schon 3 Termine offen. Für weitere Termine bitte in der Werkstatt anrufen.",
  rate_limited: "Gerade gehen sehr viele Buchungen ein. Bitte in ein paar Minuten erneut versuchen.",
  too_fast: "Bitte kurz warten und dann erneut auf „Buchen“ tippen.",
  not_bookable: "Online-Buchung ist hier gerade nicht möglich. Bitte in der Werkstatt anrufen.",
  invalid_plate: "Bitte ein gültiges Kennzeichen eintragen, z. B. MA-AB 123.",
  invalid_vehicle: "Ungültige Fahrzeugklasse.",
  email_required: "Für die Anzahlung bitte eine E-Mail-Adresse angeben.",
};

type RefundInfo = { id: string; payment_intent: string | null; account: string | null; refundable: boolean; session: string | null; pending: boolean };

/** Stripe Checkout for the deposit, on the workshop's own Stripe account. Releases the hold if that fails. */
async function depositCheckout(b: Booked & { id: string }, email: string) {
  try {
    if (!stripeReady()) throw new Error("stripe not configured");
    const info = await stripeRpc<RefundInfo>("stripe_refund_info", { p_token: b.cancel_token });
    if (!info?.account) throw new Error("no connected account");
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        locale: "de",
        customer_email: email,
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: b.deposit_cents!,
              product_data: { name: `Anzahlung: ${b.service_name}`, description: `${fullDateTime(b.starts_at, b.timezone)} bei ${b.salon_name}` },
            },
          },
        ],
        metadata: { appointment_id: b.id, terms_accepted_at: new Date().toISOString() },
        custom_text: {
          submit: { message: "Absage bis 24 Stunden vorher: Anzahlung wird erstattet. Danach oder bei Nichterscheinen behält die Werkstatt sie als Ausfallpauschale." },
        },
        payment_intent_data: { metadata: { appointment_id: b.id } },
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${appUrl()}/storno/${b.cancel_token}?bezahlt=1`,
        cancel_url: `${appUrl()}/api/stripe/abbruch?t=${b.cancel_token}`,
      },
      { stripeAccount: info.account },
    );
    await stripeRpc("stripe_appointment_session", { p_appt: b.id, p_session: session.id });
    return session.url;
  } catch (e) {
    console.error("deposit checkout failed", e);
    await stripeRpc("stripe_appointment_release", { p_appt: b.id }).catch(() => {});
    return null;
  }
}

export async function bookAction(
  input: BookInput,
): Promise<{ ok: true; booking: Booked; checkoutUrl?: string } | { ok: false; code: string; message: string }> {
  // simple bot protection: hidden field filled or form sent within 3 seconds
  if (input.website) return { ok: false, code: "error", message: "Buchung fehlgeschlagen. Bitte in der Werkstatt anrufen." };
  if (typeof input.elapsedMs === "number" && input.elapsedMs < 3000) return { ok: false, code: "too_fast", message: MESSAGES.too_fast };
  const serviceIds = (Array.isArray(input.serviceIds) ? input.serviceIds : []).map(String).slice(0, 4);
  if (!serviceIds.length) return { ok: false, code: "service_not_found", message: MESSAGES.service_not_found };
  const { data, error } = await publicClient().rpc("book_services", {
    p_slug: String(input.slug),
    p_services: serviceIds,
    p_staff: input.staffId || null,
    p_start: String(input.start),
    p_name: String(input.name ?? "").slice(0, 100),
    p_phone: String(input.phone ?? "").slice(0, 40),
    p_email: String(input.email ?? "").slice(0, 200),
    p_note: String(input.note ?? "").slice(0, 500),
    p_plate: String(input.plate ?? "").slice(0, 20),
    p_class: String(input.vehicleClass ?? "pkw").slice(0, 20),
    p_vehicle: String(input.vehicleInfo ?? "").slice(0, 120),
  });
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k)) ?? "error";
    if (code === "error") console.error("booking failed", error);
    return { ok: false, code, message: MESSAGES[code] ?? "Buchung fehlgeschlagen. Bitte erneut versuchen oder in der Werkstatt anrufen." };
  }
  const booking = data as Booked & { id: string };
  if (booking.deposit_cents && !input.acceptedTerms) {
    await stripeRpc("stripe_appointment_release", { p_appt: booking.id }).catch(() => {});
    return { ok: false, code: "terms", message: "Bitte den Stornobedingungen zustimmen." };
  }
  if (booking.deposit_cents) {
    // confirmation mails follow once the deposit is paid (webhook)
    const checkoutUrl = await depositCheckout(booking, input.email.trim());
    if (!checkoutUrl) return { ok: false, code: "error", message: "Die Anzahlung kann gerade nicht gestartet werden. Bitte später erneut versuchen oder in der Werkstatt anrufen." };
    return { ok: true, booking, checkoutUrl };
  }
  await Promise.all([
    sendBookingMails(booking, { name: input.name.trim(), email: input.email.trim() || undefined, phone: input.phone.trim(), note: input.note.trim() || undefined }),
    pushNewBooking(booking.id, booking, input.name.trim()),
  ]);
  after(() => deliverPendingEvents(5));
  return { ok: true, booking };
}

export async function cancelAction(token: string) {
  const info = stripeReady() ? await stripeRpc<RefundInfo | null>("stripe_refund_info", { p_token: String(token) }).catch(() => null) : null;
  const { data, error } = await publicClient().rpc("cancel_by_token", { p_token: String(token) });
  const ok = !error && data === true;
  let refunded = false;
  // deposit goes back automatically when cancelled at least 24 h ahead
  if (ok && info?.refundable && info.payment_intent && info.account) {
    try {
      await stripe().refunds.create({ payment_intent: info.payment_intent }, { stripeAccount: info.account });
      await stripeRpc("stripe_appointment_refunded", { p_appt: info.id });
      refunded = true;
    } catch (e) {
      console.error("deposit refund failed", e);
    }
  }
  if (ok) await notifyWaitlist({ cancelToken: String(token) });
  if (ok) after(() => deliverPendingEvents(5));
  return { ok, refunded };
}

const WAITLIST_MESSAGES: Record<string, string> = {
  invalid_name: "Bitte den vollständigen Namen eintragen.",
  invalid_email: "Bitte eine gültige E-Mail-Adresse eintragen.",
  too_many: "Sie stehen schon für 3 Tage auf der Warteliste.",
  rate_limited: "Gerade kommen sehr viele Einträge. Bitte später erneut versuchen.",
  outside_window: "Für diesen Tag ist keine Warteliste möglich.",
};

/** Puts the customer on the waitlist for a fully booked day. */
export async function joinWaitlistAction(input: { slug: string; serviceId: string | null; staffId: string | null; day: string; name: string; email: string; phone: string }) {
  const { error } = await publicClient().rpc("join_waitlist", {
    p_slug: String(input.slug),
    p_service: input.serviceId || null,
    p_staff: input.staffId || null,
    p_day: String(input.day),
    p_name: String(input.name ?? "").slice(0, 100),
    p_email: String(input.email ?? "").slice(0, 200),
    p_phone: String(input.phone ?? "").slice(0, 40),
  });
  if (!error) return { ok: true as const };
  const code = Object.keys(WAITLIST_MESSAGES).find((k) => error.message.includes(k));
  if (!code) console.error("waitlist join failed", error);
  return { ok: false as const, message: code ? WAITLIST_MESSAGES[code] : "Eintragen hat nicht geklappt. Bitte erneut versuchen." };
}

type MovableAppt = { status: string; can_move: boolean; staff_id: string; resource_id: string | null; resource_ids: string[] | null; staff_exclusive: boolean; duration_min: number; salon_slug: string; starts_at: string; ends_at: string };

/** Free start times for moving an appointment to another day, same person and duration. */
export async function rescheduleSlotsAction(token: string, day: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const { data } = await publicClient().rpc("appointment_by_token", { p_token: token });
  const a = data as MovableAppt | null;
  if (!a?.can_move) return [];
  const salon = await loadSalon(a.salon_slug);
  if (!salon) return [];
  const today = zonedDate(new Date(), salon.timezone);
  if (day < today || day > addDays(today, salon.booking_days)) return [];
  const from = new Date(`${day}T00:00:00Z`);
  from.setUTCHours(from.getUTCHours() - 14);
  const to = new Date(from.getTime() + 52 * 3600_000);
  const args = { p_slug: salon.slug, p_from: from.toISOString(), p_to: to.toISOString() };
  const [{ data: busy }, { data: places }] = await Promise.all([publicClient().rpc("busy_intervals", args), publicClient().rpc("busy_resources", args)]);
  // Plätze: je belegter Art zählt jeder aktive Platz dieser Art, der eigene Termin blockiert sich nicht
  const mine = a.resource_ids ?? (a.resource_id ? [a.resource_id] : []);
  const kinds = [...new Set(salon.resources.filter((r) => mine.includes(r.id)).map((r) => r.kind))];
  const groups = placeGroups(salon.resources, kinds);
  const ownPlace = (b: ResourceBusy) => mine.includes(b.resource_id) && +new Date(b.starts_at) === +new Date(a.starts_at) && +new Date(b.ends_at) === +new Date(a.ends_at);
  // the appointment itself does not block its own new time
  const own = (b: Busy) => b.staff_id === a.staff_id && +new Date(b.starts_at) === +new Date(a.starts_at) && +new Date(b.ends_at) === +new Date(a.ends_at);
  return freeSlots({
    date: day,
    tz: salon.timezone,
    hours: salon.hours,
    step: salon.slot_step,
    durationMin: a.duration_min,
    staffIds: [a.staff_id],
    busy: ((busy as Busy[]) ?? []).filter((b) => !own(b)),
    closures: salon,
    resources: groups.length ? { groups, busy: ((places as ResourceBusy[]) ?? []).filter((b) => !ownPlace(b)), byPlace: !a.staff_exclusive } : undefined,
  })
    .filter((s) => s.start.getTime() !== new Date(a.starts_at).getTime())
    .map((s) => s.start.toISOString());
}

const MOVE_MESSAGES: Record<string, string> = {
  slot_taken: "Diese Zeit wurde gerade vergeben. Bitte eine andere wählen.",
  too_late: "Online verschieben geht nur bis 2 Stunden vor dem Termin.",
  too_often: "Der Termin wurde schon dreimal verschoben. Bitte rufen Sie den Betrieb an.",
  closed: "Zu dieser Zeit ist die Werkstatt geschlossen.",
  outside_window: "Diese Zeit liegt außerhalb des Buchungszeitraums.",
};

/** Moves the appointment to a new start time and notifies customer and salon. */
export async function rescheduleAction(token: string, start: string) {
  const { data, error } = await publicClient().rpc("reschedule_by_token", { p_token: String(token), p_start: String(start) });
  if (error) {
    const code = Object.keys(MOVE_MESSAGES).find((k) => error.message.includes(k));
    if (!code) console.error("reschedule failed", error);
    return { ok: false as const, error: code ? MOVE_MESSAGES[code] : "Verschieben hat nicht geklappt. Bitte in der Werkstatt anrufen." };
  }
  await sendRescheduleMails(data as Rescheduled);
  after(() => deliverPendingEvents(5));
  return { ok: true as const };
}
