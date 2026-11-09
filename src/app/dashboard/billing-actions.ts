"use server";

import { userClient } from "@/lib/supabase";
import { appUrl } from "@/lib/mail";
import { stripe, stripeReady, stripeRpc, subscriptionFields, type Billing } from "@/lib/stripe";

type Result = { ok: true; url: string } | { ok: false; message: string };

const SETTINGS = () => `${appUrl()}/dashboard/leistungen`;
const NOT_READY = { ok: false as const, message: "Zahlungen sind noch nicht eingerichtet. Bitte später erneut versuchen." };

/** Billing row of a salon the caller owns, or null. */
async function ownerBilling(accessToken: string, salonId: string) {
  const sb = userClient(String(accessToken));
  const { data: auth } = await sb.auth.getUser(String(accessToken));
  if (!auth.user) return null;
  const { data: m } = await sb.from("salon_members").select("role").eq("salon_id", String(salonId)).eq("user_id", auth.user.id).maybeSingle();
  if ((m as { role: string } | null)?.role !== "owner") return null;
  const billing = await stripeRpc<Billing | null>("stripe_billing_get", { p_salon: String(salonId) });
  return billing ? { billing, email: auth.user.email ?? billing.owner_email } : null;
}

/** Small business (§ 19 UStG): no VAT, the note must be on every invoice. */
const INVOICE_FOOTER = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

const ACTIVE = ["active", "trialing", "past_due", "unpaid", "incomplete"];

/** Stripe Checkout for the monthly plan; remaining trial days carry over. */
export async function startSubscription(accessToken: string, salonId: string, interval: "month" | "year" = "month"): Promise<Result> {
  const price = interval === "year" ? process.env.STRIPE_PRICE_ID_YEARLY : process.env.STRIPE_PRICE_ID;
  if (!stripeReady() || !price) return NOT_READY;
  const o = await ownerBilling(accessToken, salonId);
  if (!o) return { ok: false, message: "Nur Inhaber können das Abo verwalten." };
  const { billing: b, email } = o;
  try {
    let customer = b.stripe_customer_id;
    if (!customer) {
      customer = (
        await stripe().customers.create({ email, name: b.salon_name, metadata: { salon_id: b.salon_id }, invoice_settings: { footer: INVOICE_FOOTER } })
      ).id;
      await stripeRpc("stripe_billing_update", { p_salon: b.salon_id, p: { stripe_customer_id: customer } });
    } else {
      await stripe().customers.update(customer, { invoice_settings: { footer: INVOICE_FOOTER } });
    }
    if (b.subscription_status && ACTIVE.includes(b.subscription_status)) return openBillingPortal(accessToken, salonId);
    const trialEnd = Math.floor(Date.parse(b.trial_ends_at) / 1000);
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: b.salon_id,
      line_items: [{ price, quantity: 1 }],
      subscription_data: {
        metadata: { salon_id: b.salon_id },
        ...(trialEnd > Date.now() / 1000 + 48 * 3600 ? { trial_end: trialEnd } : {}),
      },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      locale: "de",
      success_url: `${SETTINGS()}?abo=ok#abo`,
      cancel_url: `${SETTINGS()}#abo`,
    });
    return session.url ? { ok: true, url: session.url } : { ok: false, message: "Checkout konnte nicht gestartet werden." };
  } catch (e) {
    console.error("subscription checkout failed", e);
    return { ok: false, message: "Checkout konnte nicht gestartet werden." };
  }
}

/** Stripe customer portal: payment method, invoices, cancellation. */
export async function openBillingPortal(accessToken: string, salonId: string): Promise<Result> {
  if (!stripeReady()) return NOT_READY;
  const o = await ownerBilling(accessToken, salonId);
  if (!o?.billing.stripe_customer_id) return { ok: false, message: "Noch kein Abo vorhanden." };
  try {
    const s = await stripe().billingPortal.sessions.create({ customer: o.billing.stripe_customer_id, return_url: `${SETTINGS()}#abo`, locale: "de" });
    return { ok: true, url: s.url };
  } catch (e) {
    console.error("billing portal failed", e);
    return { ok: false, message: "Abo-Verwaltung konnte nicht geöffnet werden." };
  }
}

/** Creates the salon's own Stripe account (once) and returns the onboarding link. */
export async function startConnect(accessToken: string, salonId: string): Promise<Result> {
  if (!stripeReady()) return NOT_READY;
  const o = await ownerBilling(accessToken, salonId);
  if (!o) return { ok: false, message: "Nur Inhaber können Stripe verbinden." };
  const { billing: b, email } = o;
  try {
    let account = b.stripe_account_id;
    if (!account) {
      // Accounts v2: own full Stripe dashboard, Stripe charges its fees to the salon (like a v1 Standard account)
      account = (
        await stripe().v2.core.accounts.create({
          contact_email: email,
          display_name: b.salon_name,
          dashboard: "full",
          identity: { country: "de" },
          defaults: { currency: "eur", responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
          configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
          metadata: { salon_id: b.salon_id },
        })
      ).id;
      await stripeRpc("stripe_billing_update", { p_salon: b.salon_id, p: { stripe_account_id: account } });
    }
    const link = await stripe().v2.core.accountLinks.create({
      account,
      use_case: {
        type: "account_onboarding",
        account_onboarding: { configurations: ["merchant"], refresh_url: `${SETTINGS()}?stripe=neu#abo`, return_url: `${SETTINGS()}?stripe=zurueck#abo` },
      },
    });
    return { ok: true, url: link.url };
  } catch (e) {
    console.error("connect onboarding failed", e);
    return { ok: false, message: "Stripe-Verbindung konnte nicht gestartet werden." };
  }
}

/** Re-reads subscription and account state from Stripe (after returning from Checkout/onboarding). */
export async function syncBilling(accessToken: string, salonId: string) {
  if (!stripeReady()) return { ok: false };
  const o = await ownerBilling(accessToken, salonId);
  if (!o) return { ok: false };
  const { billing: b } = o;
  const p: Record<string, unknown> = {};
  try {
    if (b.stripe_account_id) {
      const acct = await stripe().v2.core.accounts.retrieve(b.stripe_account_id, { include: ["configuration.merchant"] });
      p.charges_enabled = acct.configuration?.merchant?.capabilities?.card_payments?.status === "active";
    }
    if (b.stripe_customer_id) {
      const subs = await stripe().subscriptions.list({ customer: b.stripe_customer_id, status: "all", limit: 1 });
      if (subs.data[0]) Object.assign(p, subscriptionFields(subs.data[0]));
    }
    if (Object.keys(p).length) await stripeRpc("stripe_billing_update", { p_salon: b.salon_id, p });
    return { ok: true };
  } catch (e) {
    console.error("billing sync failed", e);
    return { ok: false };
  }
}
