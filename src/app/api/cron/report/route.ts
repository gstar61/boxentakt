import { publicClient } from "@/lib/supabase";
import { mailEnabled, sendReport } from "@/lib/mail";
import { OPERATOR } from "@/lib/operator";
import { euro } from "@/lib/time";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type Report = {
  salons_total: number; salons_new: number; trialing: number; paying: number; past_due: number; cancelling: number; free: number;
  inactive: number; connect: number; appointments: number; appointments_online: number; cancelled: number; revenue_cents: number;
  customers_new: number; vouchers_cents: number; feedback: number;
  salons: { name: string; slug: string; state: string; appointments: number; online: number }[];
};

/** Monthly recurring revenue from active Stripe subscriptions (yearly prices divided by 12). */
async function mrrCents() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  let cents = 0;
  for await (const sub of stripe().subscriptions.list({ status: "active", limit: 100 })) {
    for (const item of sub.items.data) {
      const p = item.price;
      const per = p.recurring?.interval === "year" ? 12 : p.recurring?.interval === "week" ? 12 / 52 : 1;
      cents += ((p.unit_amount ?? 0) * (item.quantity ?? 1)) / per / (p.recurring?.interval_count ?? 1);
    }
  }
  return Math.round(cents);
}

/** 1st of the month: report for the previous month to the operator. Called by Vercel Cron. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!mailEnabled()) return Response.json({ skipped: "mail not configured" });
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const key = process.env.REMINDER_KEY ?? "";
  const rpc = (a: Date, b: Date) => publicClient().rpc("platform_report", { p_key: key, p_from: a.toISOString(), p_to: b.toISOString() });
  const [cur, prev, mrr] = await Promise.all([rpc(from, to), rpc(prevFrom, from), mrrCents().catch(() => null)]);
  if (cur.error) return Response.json({ error: cur.error.message }, { status: 500 });
  const r = cur.data as Report;
  const p = (prev.data ?? {}) as Partial<Report>;
  const n = (k: keyof Report, fmt: (v: number) => string = String) =>
    `${fmt(r[k] as number)}${typeof p[k] === "number" ? ` (${fmt(p[k] as number)})` : ""}`;
  const share = r.appointments ? Math.round((r.appointments_online / r.appointments) * 100) : 0;
  const month = from.toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

  await sendReport({
    to: process.env.REPORT_TO || OPERATOR.email,
    month,
    sections: [
      {
        title: "Geschäft",
        rows: [
          ["Monatlicher Umsatz (MRR)", mrr === null ? "–" : euro(mrr)],
          ["Zahlende Salons", String(r.paying)],
          ["In der Testphase", String(r.trialing)],
          ["Kostenlos", String(r.free)],
          ["Kündigung zum Laufzeitende", String(r.cancelling)],
          ["Zahlung offen", String(r.past_due)],
          ["Inaktiv, Löschung geplant", String(r.inactive)],
          ["Salons gesamt", String(r.salons_total)],
          ["Neue Salons", n("salons_new")],
        ],
      },
      {
        title: "Nutzung",
        rows: [
          ["Neue Termine", n("appointments")],
          ["davon online gebucht", `${r.appointments_online} · ${share} %`],
          ["Abgesagt", n("cancelled")],
          ["Umsatz der Salons (Termine)", n("revenue_cents", euro)],
          ["Neue Kunden der Salons", n("customers_new")],
          ["Gutscheine verkauft", n("vouchers_cents", euro)],
          ["Salons mit Online-Zahlung", String(r.connect)],
          ["Feedback erhalten", n("feedback")],
        ],
      },
      {
        title: "Salons",
        rows: r.salons.map((s) => [`${s.name} · ${s.state}`, `${s.appointments} Termine, ${s.online} online`]),
      },
    ],
    note: "Details wie Besucher, Zahlungen und Fehler stehen in Vercel, Stripe und Supabase.",
  });
  return Response.json({ sent: true, month });
}
