import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Gift, MapPin, Phone } from "lucide-react";
import { publicClient } from "@/lib/supabase";
import { euro } from "@/lib/time";
import { LogoMark } from "@/components/Logo";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gutschein", robots: { index: false } };

type Voucher = {
  code: string;
  amount_cents: number;
  balance_cents: number;
  status: "pending" | "active";
  valid_until: string;
  recipient_name: string | null;
  message: string | null;
  salon_name: string;
  salon_slug: string;
  salon_logo: string | null;
  salon_address: string | null;
  salon_phone: string | null;
};

const deDate = (d: string) => `${Number(d.slice(8))}.${Number(d.slice(5, 7))}.${d.slice(0, 4)}`;

export default async function VoucherPage(props: PageProps<"/gutschein/[token]">) {
  const { token } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const { data } = await publicClient().rpc("voucher_by_token", { p_token: token });
  const v = data as Voucher | null;
  if (!v) notFound();
  const q = await props.searchParams;
  const justPaid = q.bezahlt === "1";
  const used = v.status === "active" && v.balance_cents < v.amount_cents;

  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8 sm:py-12 print:max-w-none print:p-0">
      {justPaid && (
        <p className="flex items-start gap-2.5 rounded-[14px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm print:hidden">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" />
          {v.status === "active" ? "Bezahlt. Den Gutschein haben wir Ihnen auch per Mail geschickt." : "Danke! Die Zahlung wird gerade bestätigt, das dauert meist nur Sekunden. Die Mail mit dem Gutschein kommt gleich."}
        </p>
      )}

      <article className="relative overflow-hidden rounded-[24px] border border-line bg-card p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.35)] sm:p-10 print:border-2 print:shadow-none">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/10 blur-3xl print:hidden" />
        <div className="relative grid gap-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-accent/25 bg-accent/10 text-accent">
                {v.salon_logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- printed page, plain img is more reliable
                  <img src={v.salon_logo} alt="" className="size-full object-cover" />
                ) : (
                  <LogoMark size={22} />
                )}
              </span>
              <span className="text-lg font-semibold tracking-tight">{v.salon_name}</span>
            </div>
            <span className="flex items-center gap-1.5 text-sm font-medium text-accent"><Gift size={16} /> Gutschein</span>
          </div>

          <div className="grid gap-2">
            {v.recipient_name && <span className="text-muted">Für {v.recipient_name}</span>}
            <span className="text-6xl font-semibold tracking-tight sm:text-7xl">{euro(v.amount_cents)}</span>
            {used && <span className="text-sm text-muted">Restwert: <span className="font-medium text-fg tabular-nums">{euro(v.balance_cents)}</span></span>}
          </div>

          {v.message && <p className="max-w-lg whitespace-pre-wrap text-lg leading-relaxed">„{v.message}“</p>}

          <div className="grid gap-4 border-t border-dashed border-line-2 pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-1">
              <span className="label">Gutschein-Code</span>
              <span className="font-mono text-2xl font-semibold tracking-[0.12em]">{v.status === "active" ? v.code : "wird freigeschaltet …"}</span>
              <span className="text-sm text-muted">Gültig bis {deDate(v.valid_until)} · einlösbar auch in Teilbeträgen</span>
            </div>
            <div className="grid gap-1 text-sm text-muted sm:text-right">
              {v.salon_address && <span className="flex items-center gap-1.5 sm:justify-end"><MapPin size={14} /> {v.salon_address}</span>}
              {v.salon_phone && <span className="flex items-center gap-1.5 sm:justify-end"><Phone size={14} /> {v.salon_phone}</span>}
            </div>
          </div>
        </div>
      </article>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton />
        <Link href={`/${v.salon_slug}`} className="btn">Termin buchen</Link>
      </div>
      <p className="text-xs text-dim print:hidden">Diesen Link können Sie weiterschicken – wer ihn hat, kann den Gutschein nutzen.</p>
    </main>
  );
}
