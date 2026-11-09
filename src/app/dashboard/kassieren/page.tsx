"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { CheckCircle2, Copy, QrCode, RotateCcw, Smartphone, X } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { euro } from "@/lib/time";
import { useSalon } from "../salon-context";
import { VoucherSection } from "./VoucherSection";
import { cancelCounterPayment, counterPaymentStatus, createCounterPayment, todaysCounterPayments, type CounterPayment, type PaidItem } from "../pay-actions";

async function token() {
  const { data } = await browserClient().auth.getSession();
  return data.session?.access_token ?? "";
}

const time = (unix: number) => new Date(unix * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const isToday = (unix: number) => new Date(unix * 1000).toDateString() === new Date().toDateString();

export default function CounterPage() {
  const { salon, role, services: allServices } = useSalon();
  const services = allServices.filter((sv) => sv.active).slice(0, 12);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [payment, setPayment] = useState<CounterPayment | null>(null);
  const [qr, setQr] = useState("");
  const [state, setState] = useState<"open" | "paid" | "expired">("open");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState<PaidItem[]>([]);

  const loadPaid = useCallback(async () => {
    setPaid((await todaysCounterPayments(await token(), salon.id)).filter((p) => isToday(p.created)));
  }, [salon.id]);

  useEffect(() => {
    browserClient()
      .from("salon_billing")
      .select("charges_enabled")
      .eq("salon_id", salon.id)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
        const on = Boolean((data as { charges_enabled: boolean } | null)?.charges_enabled);
        setEnabled(on);
        if (on) loadPaid();
      });
  }, [salon.id, loadPaid]);

  // waiting for the customer: check every 2 s until paid or expired
  useEffect(() => {
    if (!payment || state !== "open") return;
    const t = setInterval(async () => {
      const s = await counterPaymentStatus(await token(), salon.id, payment.id);
      if (s !== "open") {
        setState(s);
        if (s === "paid") loadPaid();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [payment, state, salon.id, loadPaid]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(amount.replace(/\./g, "").replace(",", ".")) * 100);
    setMsg(null);
    setBusy(true);
    const r = await createCounterPayment(await token(), salon.id, cents, text);
    setBusy(false);
    if (!r.ok) return setMsg(r.message);
    // QR stays black on white in both themes so every phone camera reads it
    setQr(await QRCode.toString(r.payment.url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1220", light: "#ffffff" } }));
    setPayment(r.payment);
    setState("open");
  }

  async function reset(cancel: boolean) {
    if (cancel && payment) await cancelCounterPayment(await token(), salon.id, payment.id);
    setPayment(null);
    setQr("");
    setAmount("");
    setText("");
    setState("open");
  }

  const total = paid.reduce((n, p) => n + p.amount, 0);

  return (
    <div className="grid gap-6 pb-24">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">Kassieren</h1>
        <p className="text-muted">Betrag eingeben, QR-Code zeigen. Der Kunde zahlt mit dem eigenen Handy: Apple Pay, Google Pay oder Karte.</p>
      </div>

      {enabled === false && (
        <section className="card grid gap-3 p-5 sm:p-6">
          <p className="text-sm text-muted">Für Kartenzahlungen muss der Betrieb zuerst sein Stripe-Konto verbinden.</p>
          {role === "owner" ? (
            <Link href="/dashboard/leistungen#abo" className="btn w-fit">Zu den Einstellungen</Link>
          ) : (
            <p className="text-sm text-muted">Das kann nur ein Inhaber in den Einstellungen.</p>
          )}
        </section>
      )}

      {enabled && !payment && (
        <form onSubmit={create} className="card grid max-w-xl gap-4 p-5 sm:p-6">
          <div className="grid gap-1.5">
            <label htmlFor="amount" className="text-[13px] text-muted">Betrag in €</label>
            <input
              id="amount"
              className="input text-2xl font-medium tabular-nums"
              inputMode="decimal"
              autoFocus
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, "").slice(0, 9))}
            />
          </div>
          {services.length > 0 && (
            <div className="grid gap-1.5">
              <span className="text-[13px] text-muted">Oder Leistung antippen</span>
              <div className="flex flex-wrap gap-1.5">
                {services.map((sv) => (
                  <button
                    key={sv.id}
                    type="button"
                    className="pill !h-9 !px-3 text-[13px]"
                    aria-pressed={text === sv.name && amount === String(sv.price_cents / 100).replace(".", ",")}
                    onClick={() => { setAmount(String(sv.price_cents / 100).replace(".", ",")); setText(sv.name); }}
                  >
                    {sv.name} · {euro(sv.price_cents)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <label htmlFor="what" className="text-[13px] text-muted">Wofür (optional, steht auf dem Beleg)</label>
            <input id="what" className="input input-sm" maxLength={120} placeholder="z. B. Räderwechsel und Bremsencheck" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
          <button className="btn btn-primary w-fit" disabled={busy || !amount}>
            <QrCode size={18} /> {busy ? "Wird erstellt …" : "QR-Code anzeigen"}
          </button>
        </form>
      )}

      {payment && (
        <section className="card grid max-w-xl justify-items-center gap-5 p-6 text-center sm:p-8">
          {state === "paid" ? (
            <>
              <span className="grid size-16 place-items-center rounded-2xl bg-accent/10 text-accent">
                <CheckCircle2 size={34} strokeWidth={1.75} />
              </span>
              <div className="grid gap-1">
                <p className="text-4xl font-semibold tracking-tight tabular-nums">{euro(payment.amount)}</p>
                <p className="text-accent">Bezahlt</p>
              </div>
              <button className="btn btn-primary" onClick={() => reset(false)}><RotateCcw size={18} /> Nächste Zahlung</button>
            </>
          ) : state === "expired" ? (
            <>
              <p className="text-muted">Der QR-Code ist abgelaufen, es wurde nichts bezahlt.</p>
              <button className="btn" onClick={() => reset(false)}><RotateCcw size={18} /> Neu erstellen</button>
            </>
          ) : (
            <>
              <div className="grid gap-1">
                <p className="text-4xl font-semibold tracking-tight tabular-nums">{euro(payment.amount)}</p>
                <p className="text-sm text-muted">{payment.description}</p>
              </div>
              <div className="w-full max-w-[280px] rounded-2xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="flex items-center gap-2 text-sm text-muted">
                <Smartphone size={16} /> Mit der Handykamera scannen. Wartet auf Zahlung …
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(payment.url)}><Copy size={15} /> Link kopieren</button>
                <button className="btn btn-sm btn-ghost" onClick={() => reset(true)}><X size={15} /> Abbrechen</button>
              </div>
            </>
          )}
        </section>
      )}

      {enabled && (
        <section className="card grid max-w-xl gap-3 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[15px] font-semibold">Heute per Karte</h2>
            <span className="font-medium tabular-nums">{euro(total)}</span>
          </div>
          {paid.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Kartenzahlungen heute.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {paid.map((p) => (
                <li key={p.id} className="flex justify-between gap-4 border-b border-line py-1.5 last:border-0">
                  <span className="text-muted">{time(p.created)} · {p.description}</span>
                  <span className="font-medium tabular-nums">{euro(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-dim">
            Das Geld geht direkt auf das Stripe-Konto des Betriebs, abzüglich der Stripe-Gebühr. Kartenzahlungen gehören in die Kassenaufzeichnung; diese
            Funktion ersetzt keine Registrierkasse mit TSE.
          </p>
        </section>
      )}

      <VoucherSection paymentsReady={enabled} />
    </div>
  );
}
