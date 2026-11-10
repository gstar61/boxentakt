import type Stripe from "stripe";
import { after } from "next/server";
import { deliverPendingEvents } from "@/lib/radsatzpro";
import { sendBookingMails, sendVoucherMails, type Booked, type VoucherPaid } from "@/lib/mail";
import { pushNewBooking } from "@/lib/push";
import { stripe, stripeRpc, subscriptionFields } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type Paid = (Booked & { customer: { name: string; email: string | null; phone: string; note: string | null } }) | { conflict: true } | null;

/** Verifies against the platform endpoint secret, then the Connect endpoint secret (events from salons' own accounts). */
function verify(body: string, sig: string) {
  for (const secret of [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET]) {
    if (!secret) continue;
    try {
      return stripe().webhooks.constructEvent(body, sig, secret);
    } catch {}
  }
  return null;
}

async function depositPaid(session: Stripe.Checkout.Session, account: string) {
  const appt = session.metadata?.appointment_id;
  if (!appt || session.payment_status !== "paid") return;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  const r = await stripeRpc<Paid>("stripe_appointment_paid", { p_appt: appt, p_payment_intent: pi });
  if (!r) return;
  if ("conflict" in r) {
    // paid after the hold ran out and the time is taken now: give the money back
    if (pi) await stripe().refunds.create({ payment_intent: pi }, { stripeAccount: account });
    return;
  }
  const c = r.customer;
  await Promise.all([
    sendBookingMails(r, { name: c.name, email: c.email ?? undefined, phone: c.phone, note: c.note ?? undefined }),
    pushNewBooking(appt, r, c.name),
  ]);
  after(() => deliverPendingEvents(5));
}

async function voucherPaid(session: Stripe.Checkout.Session) {
  const id = session.metadata?.voucher_id;
  if (!id || session.payment_status !== "paid") return;
  const v = await stripeRpc<VoucherPaid | null>("stripe_voucher_paid", { p_voucher: id });
  if (v) await sendVoucherMails(v);
}

async function saveSubscription(sub: Stripe.Subscription) {
  const salon = sub.metadata?.salon_id;
  if (!salon) return;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await stripeRpc("stripe_billing_update", { p_salon: salon, p: { stripe_customer_id: customer, ...subscriptionFields(sub) } });
}

export async function POST(request: Request) {
  const event = verify(await request.text(), request.headers.get("stripe-signature") ?? "");
  if (!event) return new Response("invalid signature", { status: 400 });
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object;
        if (event.account && s.metadata?.voucher_id) await voucherPaid(s);
        else if (event.account) await depositPaid(s, event.account);
        else if (s.mode === "subscription" && s.subscription) {
          await saveSubscription(await stripe().subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id));
        }
        break;
      }
      case "checkout.session.expired": {
        const appt = event.data.object.metadata?.appointment_id;
        if (event.account && appt) await stripeRpc("stripe_appointment_release", { p_appt: appt });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        if (!event.account) await saveSubscription(event.data.object);
        break;
      case "account.updated": {
        const a = event.data.object;
        if (a.metadata?.salon_id) await stripeRpc("stripe_billing_update", { p_salon: a.metadata.salon_id, p: { charges_enabled: a.charges_enabled } });
        break;
      }
    }
  } catch (e) {
    console.error("stripe webhook failed", event.type, e);
    return new Response("error", { status: 500 });
  }
  return Response.json({ received: true });
}
