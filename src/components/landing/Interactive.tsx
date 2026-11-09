"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);

/** What a commission marketplace would take per year compared with Boxentakt's flat price. */
export function SavingsCalculator() {
  const [clients, setClients] = useState(15);
  const [ticket, setTicket] = useState(120);
  const [rate, setRate] = useState(20);
  const commission = clients * ticket * (rate / 100) * 12;
  const ours = 290;
  const saved = Math.max(0, commission - ours);
  return (
    <div className="card grid gap-6 p-6 sm:p-8">
      <Slider label="Neukunden über ein Vermittlungsportal pro Monat" value={clients} min={0} max={60} step={1} onChange={setClients} display={`${clients}`} />
      <Slider label="Durchschnittlicher erster Termin" value={ticket} min={30} max={400} step={5} onChange={setTicket} display={`${ticket} €`} />
      <div className="grid gap-2">
        <span className="text-[13px] text-muted">Provision des Portals</span>
        <div className="flex flex-wrap gap-2">
          {[[15, "15 %"], [20, "20 %"], [30, "30 %"]].map(([r, l]) => (
            <button key={r} type="button" className="pill" aria-pressed={rate === r} onClick={() => setRate(r as number)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 border-t border-line pt-6 sm:grid-cols-3">
        <Figure label="Provision pro Jahr" value={`${fmt(commission)} €`} muted />
        <Figure label="Boxentakt pro Jahr" value={`${fmt(ours)} €`} muted />
        <Figure label="Bleibt bei Ihnen" value={`${fmt(saved)} €`} />
      </div>
      <p className="text-xs text-dim">Ohne Grundgebühr des Portals gerechnet. Boxentakt mit Jahresabo, keine Umsatzsteuer.</p>
    </div>
  );
}

function Slider(p: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string }) {
  return (
    <label className="grid gap-2.5">
      <span className="flex items-baseline justify-between gap-4 text-[13px] text-muted">
        {p.label}
        <span className="font-mono text-lg text-fg tabular-nums">{p.display}</span>
      </span>
      <input type="range" className="accent-[var(--color-accent)]" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} />
    </label>
  );
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-2xl font-semibold tracking-tight tabular-nums ${muted ? "" : "text-accent"}`}>{value}</span>
    </div>
  );
}

const INCLUDED = [
  "Buchungsseite mit eigenem Link und QR-Code",
  "Kalender für das ganze Team",
  "Bestätigung, Erinnerung und Absage-Link per E-Mail",
  "Kundenkartei mit Excel-Export",
  "Online-Anzahlung über Ihr Stripe-Konto",
  "Kassieren per QR-Code",
  "Persönlicher Support per E-Mail",
];

/** Pricing card with monthly/yearly switch. */
export function PricingCard() {
  const [yearly, setYearly] = useState(true);
  return (
    <div className="card grid w-full max-w-md gap-6 border-accent/30 p-8">
      <div role="radiogroup" aria-label="Zahlweise" className="grid grid-cols-2 rounded-xl border border-line bg-card-2 p-1 text-sm">
        {[[false, "Monatlich"], [true, "Jährlich"]].map(([v, l]) => (
          <button
            key={l as string}
            type="button"
            role="radio"
            aria-checked={yearly === v}
            onClick={() => setYearly(v as boolean)}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 font-medium text-muted aria-checked:bg-card aria-checked:text-fg aria-checked:shadow-sm"
          >
            {l as string}
            {v && <span className="rounded-md bg-accent/12 px-1.5 py-0.5 text-[11px] text-accent">−17 %</span>}
          </button>
        ))}
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-semibold tracking-tight"><span className="font-mono">{yearly ? "290" : "29"}</span>&thinsp;€</span>
          <span className="text-muted">/ {yearly ? "Jahr" : "Monat"}</span>
        </div>
        <p className="text-sm text-muted">{yearly ? "Entspricht 24,17 € im Monat – zwei Monate geschenkt." : "Monatlich kündbar, ohne Mindestlaufzeit."}</p>
        <p className="text-xs text-dim">Endpreis, keine Umsatzsteuer (§ 19 UStG). Ganzes Team inklusive, keine Provision.</p>
      </div>
      <ul className="grid gap-2.5 text-sm">
        {INCLUDED.map((t) => (
          <li key={t} className="flex items-start gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" /> {t}</li>
        ))}
      </ul>
      <Link href="/registrieren" className="btn btn-primary justify-center">30 Tage kostenlos testen</Link>
      <p className="-mt-3 text-center text-xs text-dim">Keine Kreditkarte nötig. Das Abo schließen Sie erst nach dem Test ab.</p>
    </div>
  );
}
