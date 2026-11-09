"use server";

import { appUrl } from "@/lib/mail";
import { stripe, stripeReady, stripeRpc } from "@/lib/stripe";
import { euro } from "@/lib/time";

const MESSAGES: Record<string, string> = {
  vouchers_disabled: "Gutscheine können hier gerade nicht online gekauft werden. Bitte im Betrieb fragen.",
  invalid_amount: "Bitte einen Betrag zwischen 10 und 500 € wählen.",
  invalid_name: "Bitte Ihren Namen eintragen.",
  invalid_email: "Die E-Mail-Adresse sieht nicht richtig aus.",
  rate_limited: "Gerade gehen sehr viele Bestellungen ein. Bitte in ein paar Minuten erneut versuchen.",
};

type Created = { id: string; token: string; account: string; salon_name: string; slug: string };

/** Creates a pending voucher and a Stripe Checkout on the salon's own account; the webhook activates it. */
export async function buyVoucherAction(input: { slug: string; amountCents: number; buyerName: string; buyerEmail: string; recipient: string; message: string }) {
  if (!stripeReady()) return { ok: false as const, message: MESSAGES.vouchers_disabled };
  let v: Created;
  try {
    v = await stripeRpc<Created>("stripe_voucher_create", {
      p_slug: String(input.slug),
      p_amount: Math.round(Number(input.amountCents)),
      p_buyer_name: String(input.buyerName ?? "").slice(0, 100),
      p_buyer_email: String(input.buyerEmail ?? "").slice(0, 200),
      p_recipient: String(input.recipient ?? "").slice(0, 100),
      p_message: String(input.message ?? "").slice(0, 300),
    });
  } catch (e) {
    const code = Object.keys(MESSAGES).find((k) => String(e).includes(k));
    if (!code) console.error("voucher create failed", e);
    return { ok: false as const, message: code ? MESSAGES[code] : "Das hat nicht geklappt. Bitte erneut versuchen." };
  }
  try {
    const amount = Math.round(Number(input.amountCents));
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        locale: "de",
        customer_email: String(input.buyerEmail).trim(),
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: amount,
              product_data: { name: `Gutschein über ${euro(amount)}`, description: `Einlösbar bei ${v.salon_name}` },
            },
          },
        ],
        metadata: { voucher_id: v.id },
        payment_intent_data: { metadata: { voucher_id: v.id } },
        success_url: `${appUrl()}/gutschein/${v.token}?bezahlt=1`,
        cancel_url: `${appUrl()}/${v.slug}/gutschein`,
      },
      { stripeAccount: v.account },
    );
    await stripeRpc("stripe_voucher_session", { p_voucher: v.id, p_session: session.id });
    return { ok: true as const, url: session.url! };
  } catch (e) {
    console.error("voucher checkout failed", e);
    return { ok: false as const, message: "Die Zahlung kann gerade nicht gestartet werden. Bitte später erneut versuchen." };
  }
}
