"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Gift, Lock } from "lucide-react";
import { euro } from "@/lib/time";
import { Field } from "@/components/Field";
import { LogoMark } from "@/components/Logo";
import { buyVoucherAction } from "../../voucher-actions";

const PRESETS = [2500, 5000, 7500, 10000];

type Salon = { slug: string; name: string; logo_url: string | null; address: string | null; phone: string | null };

export default function VoucherClient({ salon, open }: { salon: Salon; open: boolean }) {
  const [amount, setAmount] = useState<number | "custom">(5000);
  const [custom, setCustom] = useState("");
  const [f, setF] = useState({ buyerName: "", buyerEmail: "", recipient: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cents = amount === "custom" ? Math.round(Number(custom.replace(",", ".")) * 100) : amount;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(cents) || cents < 1000 || cents > 50000) return setError("Bitte einen Betrag zwischen 10 und 500 € wählen.");
    if (f.buyerName.trim().length < 2) return setError("Bitte Ihren Namen eintragen.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.buyerEmail.trim())) return setError("An diese Adresse schicken wir den Gutschein. Bitte prüfen.");
    start(async () => {
      const r = await buyVoucherAction({ slug: salon.slug, amountCents: cents, ...f });
      if (r.ok) window.location.href = r.url;
      else setError(r.message);
    });
  }

  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-8 sm:py-12">
      <Link href={`/${salon.slug}`} className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft size={16} /> Zur Buchungsseite</Link>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-accent/25 bg-accent/10 text-accent">
          {salon.logo_url ? <Image src={salon.logo_url} alt="" width={88} height={88} className="size-full object-cover" /> : <LogoMark size={20} />}
        </span>
        <div>
          <div className="font-semibold tracking-tight">{salon.name}</div>
          {salon.address && <div className="text-xs text-muted">{salon.address}</div>}
        </div>
      </div>
      <div className="grid gap-2">
        <h1 className="flex items-center gap-2.5 text-3xl font-semibold"><Gift size={26} className="text-accent" strokeWidth={1.75} /> Gutschein verschenken</h1>
        <p className="text-muted">Sofort per Mail zum Ausdrucken oder Weiterleiten. Einlösbar für alle Leistungen, auch in Teilbeträgen.</p>
      </div>

      {!open ? (
        <p className="empty">Online gibt es hier gerade keine Gutscheine.{salon.phone ? ` Gerne im Betrieb oder unter ${salon.phone}.` : " Gerne direkt im Betrieb."}</p>
      ) : (
        <form onSubmit={submit} noValidate className="card grid gap-5 p-5 sm:p-6">
          <div className="grid gap-2">
            <span className="label">Betrag</span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {PRESETS.map((p) => (
                <button key={p} type="button" className="pill tabular-nums" aria-pressed={amount === p} onClick={() => setAmount(p)}>{euro(p)}</button>
              ))}
              <button type="button" className="pill" aria-pressed={amount === "custom"} onClick={() => setAmount("custom")}>Anderer</button>
            </div>
            {amount === "custom" && (
              <input aria-label="Eigener Betrag in Euro" inputMode="decimal" className="input w-40 tabular-nums" placeholder="z. B. 40" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />
            )}
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field id="v-name" label="Ihr Name" autoComplete="name" value={f.buyerName} onChange={(v) => setF({ ...f, buyerName: v })} />
            <Field id="v-mail" label="Ihre E-Mail (Gutschein kommt hierhin)" type="email" autoComplete="email" value={f.buyerEmail} onChange={(v) => setF({ ...f, buyerEmail: v })} />
          </div>
          <Field id="v-for" label="Für wen? (optional, steht auf dem Gutschein)" value={f.recipient} onChange={(v) => setF({ ...f, recipient: v })} />
          <div className="grid gap-1.5">
            <label htmlFor="v-msg" className="text-[13px] text-muted">Persönliche Nachricht (optional)</label>
            <textarea id="v-msg" className="input !min-h-[84px] text-sm" maxLength={300} placeholder="Alles Gute zum Geburtstag!" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button className="btn btn-primary" disabled={pending}>
            <Lock size={16} /> {pending ? "Weiter zur Zahlung …" : `${Number.isFinite(cents) && cents >= 1000 ? euro(cents) : "Betrag"} bezahlen`}
          </button>
          <p className="text-xs text-dim">Zahlung per Karte über Stripe direkt an {salon.name}. Gültig bis Ende des dritten Jahres nach dem Kauf. Ihre Daten nutzt der Betrieb nur für diesen Gutschein.</p>
        </form>
      )}
    </main>
  );
}
