"use server";

import { userClient } from "@/lib/supabase";
import { appUrl } from "@/lib/mail";
import { stripe, stripeReady, stripeRpc, type Billing } from "@/lib/stripe";

/** Connected Stripe account of a salon the caller belongs to (any role), if card payments are enabled. */
async function memberAccount(accessToken: string, salonId: string) {
  if (!stripeReady()) return null;
  const sb = userClient(String(accessToken));
  const { data: auth } = await sb.auth.getUser(String(accessToken));
  if (!auth.user) return null;
  const { data: m } = await sb.from("salon_members").select("role").eq("salon_id", String(salonId)).eq("user_id", auth.user.id).maybeSingle();
  if (!m) return null;
  const b = await stripeRpc<Billing | null>("stripe_billing_get", { p_salon: String(salonId) });
  return b?.charges_enabled && b.stripe_account_id ? { account: b.stripe_account_id, salon: b.salon_name, slug: b.slug } : null;
}

export type CounterPayment = { id: string; url: string; amount: number; description: string };

/** Payment at the counter: the customer scans a QR code and pays on their own phone (Apple Pay, Google Pay, card). */
export async function createCounterPayment(
  accessToken: string,
  salonId: string,
  amountCents: number,
  description: string,
): Promise<{ ok: true; payment: CounterPayment } | { ok: false; message: string }> {
  const amount = Math.round(Number(amountCents));
  if (!Number.isFinite(amount) || amount < 50 || amount > 100_000) return { ok: false, message: "Bitte einen Betrag zwischen 0,50 € und 1.000 € eingeben." };
  const a = await memberAccount(accessToken, salonId);
  if (!a) return { ok: false, message: "Kartenzahlung ist für diesen Betrieb noch nicht eingerichtet." };
  const text = String(description ?? "").trim().slice(0, 120) || "Werkstattleistung";
  try {
    const s = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        locale: "de",
        payment_method_types: ["card"],
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: amount, product_data: { name: text, description: a.salon } } }],
        metadata: { kind: "counter", salon_id: String(salonId) },
        payment_intent_data: { description: `${a.salon}: ${text}`, metadata: { kind: "counter" } },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 30,
        success_url: `${appUrl()}/bezahlt?salon=${encodeURIComponent(a.slug)}`,
        cancel_url: `${appUrl()}/bezahlt?salon=${encodeURIComponent(a.slug)}&abgebrochen=1`,
      },
      { stripeAccount: a.account },
    );
    if (!s.url) throw new Error("no url");
    return { ok: true, payment: { id: s.id, url: s.url, amount, description: text } };
  } catch (e) {
    console.error("counter payment failed", e);
    return { ok: false, message: "Zahlung konnte nicht erstellt werden. Bitte erneut versuchen." };
  }
}

/** "open" | "paid" | "expired" for a counter payment. */
export async function counterPaymentStatus(accessToken: string, salonId: string, sessionId: string) {
  const a = await memberAccount(accessToken, salonId);
  if (!a || !/^cs_[\w]+$/.test(String(sessionId))) return "open" as const;
  try {
    const s = await stripe().checkout.sessions.retrieve(String(sessionId), {}, { stripeAccount: a.account });
    if (s.metadata?.salon_id !== String(salonId)) return "open" as const;
    return s.payment_status === "paid" ? ("paid" as const) : s.status === "expired" ? ("expired" as const) : ("open" as const);
  } catch {
    return "open" as const;
  }
}

/** Cancels an unpaid counter payment so the QR code no longer works. */
export async function cancelCounterPayment(accessToken: string, salonId: string, sessionId: string) {
  const a = await memberAccount(accessToken, salonId);
  if (!a || !/^cs_[\w]+$/.test(String(sessionId))) return;
  await stripe().checkout.sessions.expire(String(sessionId), {}, { stripeAccount: a.account }).catch(() => {});
}

export type PaidItem = { id: string; amount: number; description: string; created: number };

/** Today's paid counter payments (newest first). */
export async function todaysCounterPayments(accessToken: string, salonId: string): Promise<PaidItem[]> {
  const a = await memberAccount(accessToken, salonId);
  if (!a) return [];
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  try {
    const list = await stripe().checkout.sessions.list(
      { limit: 100, created: { gte: Math.floor(since.getTime() / 1000) - 6 * 3600 }, expand: ["data.line_items"] },
      { stripeAccount: a.account },
    );
    return list.data
      .filter((s) => s.metadata?.kind === "counter" && s.metadata.salon_id === String(salonId) && s.payment_status === "paid")
      .map((s) => ({ id: s.id, amount: s.amount_total ?? 0, description: s.line_items?.data[0]?.description ?? "Werkstattleistung", created: s.created }));
  } catch (e) {
    console.error("counter list failed", e);
    return [];
  }
}
