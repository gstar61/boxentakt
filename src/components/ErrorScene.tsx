"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { OPERATOR } from "@/lib/operator";

const PUNS = [
  "Diese Seite hat sich die Haare schneiden lassen – ein bisschen zu kurz.",
  "Hier wurde etwas zu viel weggeschnitten.",
  "Diese Adresse ist so kahl wie der Boden nach Feierabend.",
  "Der Link hat Spliss. Wir empfehlen einen frischen Schnitt.",
  "Gesucht, gekämmt, geföhnt – trotzdem nichts gefunden.",
  "Diese Seite ist gerade beim Färben. Leider für immer.",
  "Kein Termin frei auf dieser Seite. Auf der Startseite schon.",
  "Diese URL hat einen Bad Hair Day.",
  "Wir haben jedes Haar umgedreht. Nichts.",
  "Schnitt daneben – diese Seite gibt es nicht.",
];

/** Small animated scene: scissors snip through a big number, a few hairs fall. Static with reduced motion. */
export function SnipScene({ label = "404" }: { label?: string }) {
  const [pun, setPun] = useState(() => Math.floor(Math.random() * PUNS.length));
  return (
    <div className="grid justify-items-center gap-3">
      <div className="snip relative h-28 w-60 select-none" aria-hidden>
        <span className="snip-text absolute inset-0 grid place-items-center font-semibold tracking-tight text-fg/10 text-[88px] leading-none">{label}</span>
        <svg className="snip-scissors absolute top-1/2 left-0 size-10 -translate-y-1/2 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path className="snip-blade-a" d="M8.12 8.12 20 20" />
          <path className="snip-blade-b" d="M8.12 15.88 20 4" />
        </svg>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="snip-hair absolute top-1/2 h-3 w-px rounded-full bg-muted/60" style={{ left: `${30 + i * 14}%`, animationDelay: `${0.4 + i * 0.35}s` }} />
        ))}
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
