/**
 * "Made in Mannheim" with a tiny map of the Quadrate: the city centre's grid of blocks inside the Ring.
 * Fits the brand – Mannheim has been planning in timetable squares since 1607.
 */
export function MadeInMannheim({ className = "" }: { className?: string }) {
  const blocks = [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => [r, c])).filter(([r, c]) => !((r === 0 || r === 3) && (c === 0 || c === 3)));
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title="Mannheim, die Quadratestadt – hier wird seit 1607 in Kästchen geplant.">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className="shrink-0">
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
        {blocks.map(([r, c]) => (
          <rect
            key={`${r}${c}`}
            x={5.6 + c * 3.4}
            y={5.6 + r * 3.4}
            width="2.6"
            height="2.6"
            rx=".6"
            fill={r === 1 && c === 2 ? "var(--color-accent)" : "currentColor"}
          />
        ))}
      </svg>
      <span>
        Made in <span className="text-fg">Mannheim</span>
      </span>
    </span>
  );
}
