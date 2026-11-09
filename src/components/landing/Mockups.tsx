import { BellRing, CalendarCheck2, Check, Clock3, CreditCard, Gift, MapPin, Smartphone, TrendingDown, TrendingUp } from "lucide-react";
import { LogoMark } from "@/components/Logo";

/** Static product illustrations for the landing page, built from the real UI tokens instead of screenshots. */

export function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative w-[270px] rounded-[42px] border border-line-2 bg-card p-2.5 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45)] ${className}`}>
      <div className="absolute top-4 left-1/2 z-10 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-bg" />
      <div className="h-[540px] overflow-hidden rounded-[34px] border border-line bg-bg">{children}</div>
    </div>
  );
}

/** The salon's public booking page on a phone. */
export function PhoneBooking() {
  const services = [
    ["Damen · Schneiden & Föhnen", "45 Min.", "ab 49 €", true],
    ["Herren · Schneiden", "30 Min.", "ab 28 €", false],
    ["Balayage", "2 Std.", "ab 129 €", false],
  ] as const;
  return (
    <PhoneFrame>
      <div className="grid gap-3 px-4 pt-12 pb-4 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg border border-accent/25 bg-accent/10 text-accent"><LogoMark size={12} /></span>
          <div>
            <div className="text-[12px] font-semibold">Studio Mira</div>
            <div className="flex items-center gap-1 text-[9px] text-muted"><MapPin size={9} /> Mannheim, Quadrate</div>
          </div>
        </div>
        <div className="text-[17px] leading-tight font-semibold">Termin buchen</div>
        <div className="grid gap-1.5">
          {services.map(([n, d, p, on]) => (
            <div key={n} className={`grid grid-cols-[1fr_auto] gap-x-2 rounded-xl border px-3 py-2 ${on ? "border-accent bg-accent/10" : "border-line bg-card-2"}`}>
              <span className="font-medium">{n}</span>
              <span className="row-span-2 self-center tabular-nums">{p}</span>
              <span className="flex items-center gap-1 text-[9px] text-muted"><Clock3 size={9} /> {d}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[["Di", "27"], ["Mi", "28"], ["Do", "29"], ["Fr", "30"]].map(([d, n], i) => (
            <div key={n} className={`grid flex-1 justify-items-center rounded-lg border py-1.5 ${i === 1 ? "border-accent bg-accent/10" : "border-line bg-card-2"}`}>
              <span className="text-[8px] uppercase text-muted">{d}</span>
              <span className="font-mono text-[13px] font-semibold">{n}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5 font-mono">
          {["09:00", "09:30", "11:00", "11:30", "14:00", "14:30", "16:00", "17:30"].map((t) => (
            <span key={t} className={`grid h-7 place-items-center rounded-lg border text-[10px] ${t === "14:30" ? "border-accent bg-accent text-accent-ink" : "border-line-2"}`}>{t}</span>
          ))}
        </div>
        <div className="mt-1 grid h-9 place-items-center rounded-xl bg-accent text-[11px] font-semibold text-accent-ink">Termin buchen</div>
        <div className="text-center text-[9px] text-dim">Ohne Konto · Bestätigung per E-Mail</div>
      </div>
    </PhoneFrame>
  );
}

/** Customer's phone after scanning the counter QR code. */
export function PhonePay() {
  return (
    <PhoneFrame>
      <div className="grid h-full content-between px-5 pt-14 pb-6 text-[11px]">
        <div className="grid gap-4">
          <div className="text-muted">Studio Mira</div>
          <div className="grid gap-1">
            <div className="text-[12px] text-muted">Schnitt und Färben</div>
            <div className="text-[30px] font-semibold tracking-tight tabular-nums">84,00 €</div>
          </div>
          <div className="grid gap-2">
            <div className="grid h-10 place-items-center rounded-xl bg-fg text-[12px] font-semibold text-bg">Apple Pay</div>
            <div className="grid h-10 place-items-center rounded-xl border border-line-2 text-[12px] font-medium">Google Pay</div>
            <div className="flex items-center gap-2 text-[9px] text-dim before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">oder Karte</div>
            <div className="grid h-9 items-center rounded-lg border border-line-2 bg-card-2 px-3 font-mono text-[10px] text-dim">1234 1234 1234 1234</div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[9px] text-dim"><CreditCard size={10} /> Sicher bezahlt über Stripe</div>
      </div>
    </PhoneFrame>
  );
}

/** The salon's screen while the customer pays. */
export function CounterCard({ qr }: { qr: string }) {
  return (
    <div className="card grid w-[280px] justify-items-center gap-4 p-6 text-center">
      <span className="label">Kassieren</span>
      <div className="text-3xl font-semibold tracking-tight tabular-nums">84,00 €</div>
      <div className="w-[170px] rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
      <div className="flex items-center gap-1.5 text-xs text-muted"><Smartphone size={13} /> Wartet auf Zahlung …</div>
    </div>
  );
}

/** Reminder email the day before plus the deposit line. */
export function ReminderStack() {
  return (
    <div className="relative grid w-full max-w-[420px] gap-4">
      <div className="card grid gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent/12 text-accent"><BellRing size={15} /></span>
          <div className="text-sm">
            <div className="font-medium">Erinnerung: Ihr Termin morgen</div>
            <div className="text-xs text-muted">Studio Mira · heute, 18:00</div>
          </div>
        </div>
        <div className="grid gap-1.5 rounded-xl border border-line bg-card-2 p-3.5 text-[13px]">
          {[["Termin", "Mi, 28. Okt., 14:30"], ["Leistung", "Schneiden & Föhnen"], ["Bei", "Anna"]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><span className="text-muted">{k}</span><span>{v}</span></div>
          ))}
        </div>
        <div className="text-xs text-muted">Doch keine Zeit? <span className="text-accent underline underline-offset-2">Hier absagen</span> – der Termin wird sofort wieder frei.</div>
      </div>
      <div className="card ml-auto flex w-[85%] items-center gap-3 px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg bg-accent/12 text-accent"><CalendarCheck2 size={15} /></span>
        <div className="flex-1 text-sm">
          <div className="font-medium">Anzahlung 15 € bezahlt</div>
          <div className="text-xs text-muted">Kundin hat der Ausfallregel zugestimmt</div>
        </div>
        <Check size={16} className="text-accent" />
      </div>
    </div>
  );
}

/** Printable voucher as the buyer gets it, plus the redemption in the salon. */
export function VoucherStack() {
  return (
    <div className="relative grid w-[360px] max-w-full gap-4">
      <div className="card relative grid gap-5 overflow-hidden p-6">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-44 rounded-full bg-accent/15 blur-2xl" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-7 place-items-center rounded-lg border border-accent/25 bg-accent/10 text-accent"><LogoMark size={12} /></span>
            Studio Mira
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted"><Gift size={13} /> Gutschein</span>
        </div>
        <div className="grid gap-1">
          <div className="text-xs text-muted">Für Lena, von Jonas</div>
          <div className="text-[40px] leading-none font-semibold tracking-tight tabular-nums">50 €</div>
          <div className="text-sm text-muted">„Alles Gute zum Geburtstag!“</div>
        </div>
        <div className="flex items-end justify-between gap-4 border-t border-dashed border-line-2 pt-4 text-xs">
          <div className="grid gap-0.5">
            <span className="text-muted">Code</span>
            <span className="font-mono text-[13px] tracking-wider">TT-8K4M-Q2WD</span>
          </div>
          <span className="text-muted">gültig bis 31.12.2029</span>
        </div>
      </div>
      <div className="card ml-auto flex w-[85%] items-center gap-3 px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg bg-accent/12 text-accent"><Check size={15} /></span>
        <div className="flex-1 text-sm">
          <div className="font-medium">25 € eingelöst</div>
          <div className="text-xs text-muted">Restwert 25 €, bleibt auf dem Gutschein</div>
        </div>
      </div>
    </div>
  );
}

/** Monthly analytics: revenue tile with comparison and a small revenue bar chart. */
export function StatsPreview() {
  const weeks = [62, 78, 70, 94];
  return (
    <div className="card grid w-[360px] max-w-full gap-5 p-6">
      <div className="flex items-center justify-between">
        <span className="label">Auswertung · Oktober</span>
        <span className="rounded-full border border-line-2 px-2.5 py-0.5 text-xs text-muted">Monat</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {([["Umsatz", "6.840 €", "+12 %", TrendingUp], ["Termine", "142", "+8 %", TrendingUp], ["Neue Kunden", "23", "+4", TrendingUp], ["Ausfallquote", "2 %", "−3 Pkt.", TrendingDown]] as const).map(([k, v, d, Trend]) => (
          <div key={k} className="grid gap-1 rounded-xl border border-line bg-card-2 p-3">
            <span className="text-xs text-muted">{k}</span>
            <span className="text-xl font-semibold tracking-tight">{v}</span>
            <span className="flex items-center gap-1 text-xs text-accent"><Trend size={12} /> {d}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-2">
        <span className="text-xs text-muted">Umsatz je Woche</span>
        <div className="flex h-24 items-end gap-3 border-b border-line">
          {weeks.map((h, i) => (
            <div key={i} className="flex h-full flex-1 items-end justify-center">
              <div className={`w-6 rounded-t-[4px] ${i === weeks.length - 1 ? "bg-accent" : "bg-accent/35"}`} style={{ height: `${h}%` }} />
            </div>
          ))}
        </div>
        <div className="flex gap-3 text-center text-[11px] text-dim tabular-nums">
          {["KW 40", "KW 41", "KW 42", "KW 43"].map((w) => <span key={w} className="flex-1">{w}</span>)}
        </div>
      </div>
    </div>
  );
}
