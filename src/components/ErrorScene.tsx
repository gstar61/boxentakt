"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { OPERATOR } from "@/lib/operator";

const PUNS = [
  "Diese Seite ist in der Werkstatt. Leider schon seit Wochen.",
  "Hier ist eine Schraube locker – und zwar die Adresse.",
  "Reifen gewechselt, Seite vergessen.",
  "Diese Adresse hat einen Platten.",
  "Gesucht, gehoben, geprüft – nichts gefunden.",
  "Die Seite ist zur HU gefahren und nicht bestanden.",
  "Kein Termin frei auf dieser Seite. Auf der Startseite schon.",
  "Hier fehlt das Kennzeichen. Und die Seite.",
  "Wir haben jede Hebebühne angehoben. Nichts.",
  "Sackgasse – diese Seite gibt es nicht.",
];

/** Small animated scene: a wheel rolls across a big number. Static with reduced motion. */
export function WheelScene({ label = "404" }: { label?: string }) {
  const [pun, setPun] = useState(() => Math.floor(Math.random() * PUNS.length));
  return (
    <div className="grid justify-items-center gap-3">
      <div className="roll relative h-28 w-60 select-none" aria-hidden>
        <span className="absolute inset-0 grid place-items-center font-semibold tracking-tight text-fg/10 text-[88px] leading-none">{label}</span>
        <svg className="roll-wheel absolute top-1/2 left-0 size-10 -translate-y-1/2 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21" />
        </svg>
      </div>
      <p className="max-w-xs text-center text-[13px] text-muted">{PUNS[pun]}</p>
      <button type="button" onClick={() => setPun((p) => (p + 1 + Math.floor(Math.random() * (PUNS.length - 1))) % PUNS.length)} className="flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
        <RefreshCw size={13} /> Neuer Spruch
      </button>
    </div>
  );
}

/** "Melde es uns" as a prefilled mail – works without login, with page and error id. */
export function ReportLink({ subject, digest, children }: { subject: string; digest?: string; children: React.ReactNode }) {
  function open() {
    const body = `Seite: ${location.href}${digest ? `\nFehler-ID: ${digest}` : ""}\n\nWas ist passiert?\n`;
    location.href = `mailto:${OPERATOR.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  return <button type="button" onClick={open} className="font-medium text-accent underline-offset-4 hover:underline">{children}</button>;
}
