/** Trimtable mark: a 3×3 timetable, one slot taken (foreground), one past (faded). Inherits the accent via currentColor. */
export function LogoMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="13 13 38 38" aria-hidden className={className}>
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}${c}`}
            x={13 + c * 14}
            y={13 + r * 14}
            width="10"
            height="10"
            rx="3"
            fill={r === 1 && c === 2 ? "var(--color-fg)" : "currentColor"}
            opacity={r === 2 && c === 0 ? 0.35 : 1}
          />
        )),
      )}
    </svg>
  );
}
