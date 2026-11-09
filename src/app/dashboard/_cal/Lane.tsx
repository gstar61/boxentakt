"use client";

import { addDays, atLocal, hm, toMin, zonedMinutes, type Hours } from "@/lib/time";
import type { Absence, Appt } from "./data";

/** One column of the timeline: a person on one day. */
export function Lane(props: {
  date: string;
  tz: string;
  range: readonly [number, number];
  px: number;
  intervals: Hours[];
  appts: Appt[];
  absences: Absence[];
  nowMin: number | null;
  compact?: boolean;
  className?: string;
  onEmpty?: (min: number) => void;
  onOpenAppt: (id: string) => void;
  onOpenAbsence: (id: string) => void;
  step: number;
}) {
  const { range, px, tz } = props;
  const height = (range[1] - range[0]) * px + 8;
  const dayStart = atLocal(props.date, 0, tz).getTime();
  const dayEnd = atLocal(addDays(props.date, 1), 0, tz).getTime();
  const clip = (d: Date, fallback: number) => {
    const t = d.getTime();
    if (t <= dayStart) return range[0];
    if (t >= dayEnd) return range[1];
    return Math.min(Math.max(zonedMinutes(d, tz), range[0]), range[1]) || fallback;
  };

  // shaded areas outside opening hours, including breaks
  const closed: [number, number][] = [];
  let cursor = range[0];
  for (const iv of [...props.intervals].sort((a, b) => toMin(a.opens) - toMin(b.opens))) {
    if (toMin(iv.opens) > cursor) closed.push([cursor, toMin(iv.opens)]);
    cursor = Math.max(cursor, toMin(iv.closes));
  }
  if (cursor < range[1]) closed.push([cursor, range[1]]);

  return (
    <div
      className={`relative ${props.onEmpty ? "cursor-copy" : ""} ${props.className ?? ""}`}
      style={{ height, background: `linear-gradient(var(--color-line) 1px, transparent 1px) 0 0 / 100% ${60 * px}px` }}
      onClick={(e) => {
        if (!props.onEmpty || (e.target as HTMLElement).closest("button")) return;
        const r = e.currentTarget.getBoundingClientRect();
        props.onEmpty(range[0] + Math.floor((e.clientY - r.top) / px / props.step) * props.step);
      }}
    >
      {closed.map(([a, b]) => (
        <div key={a} className="pointer-events-none absolute inset-x-0 bg-shade" style={{ top: (a - range[0]) * px, height: (b - a) * px }} />
      ))}
      {props.nowMin != null && props.nowMin >= range[0] && props.nowMin <= range[1] && (
        <div className="pointer-events-none absolute inset-x-0 z-[2] border-t-[1.5px] border-danger" style={{ top: (props.nowMin - range[0]) * px }} />
      )}
      {props.absences.map((ab) => {
        const a = clip(ab.start, range[0]);
        const b = clip(ab.end, range[1]);
        if (b <= a) return null;
        return (
          <button
            key={ab.id}
            onClick={() => props.onOpenAbsence(ab.id)}
            className="absolute inset-x-1 z-[1] overflow-hidden rounded-[10px] border border-dashed border-line-2 bg-[repeating-linear-gradient(135deg,rgb(148_163_184/0.14)_0_6px,transparent_6px_12px)] px-2 py-1 text-left text-xs text-muted"
            style={{ top: (a - range[0]) * px + 1, height: Math.max((b - a) * px - 2, 18) }}
          >
            {ab.reason || "Abwesend"}
          </button>
        );
      })}
      {props.appts.map((a) => {
        const startMin = zonedMinutes(a.start, tz);
        const len = (a.end.getTime() - a.start.getTime()) / 60000;
        const ht = Math.max(len * px - 3, props.compact ? 20 : 24);
        const tone =
          a.status === "erschienen"
            ? "border-slate-400/30 bg-slate-400/12 [&_.t]:text-muted"
            : a.status === "nicht_erschienen"
              ? "border-danger/40 bg-danger/12 [&_.t]:text-danger"
              : "border-accent/35 bg-accent/14 [&_.t]:text-accent";
        return (
          <button
            key={a.id}
            onClick={() => props.onOpenAppt(a.id)}
            title={`${hm(startMin)} ${a.license_plate ? a.license_plate + " · " : ""}${a.customer?.name ?? ""} · ${a.service_name}`}
            className={`absolute z-[3] grid content-start gap-px overflow-hidden rounded-[10px] border text-left transition hover:-translate-y-px ${props.compact ? "inset-x-0.5 px-1.5 py-1" : "inset-x-1.5 px-2.5 py-1.5"} ${tone}`}
            style={{ top: (startMin - range[0]) * px + 1, height: ht }}
          >
            {ht < 40 ? (
              // short slots: time and name on one line so the name stays readable
              <span className={`flex items-baseline gap-1.5 truncate ${props.compact ? "text-xs" : "text-[13px]"}`}>
                <span className="t shrink-0 font-mono text-[11px]">{hm(startMin)}</span>
                <span className="truncate font-semibold">{a.license_plate ?? a.customer?.name ?? "–"}</span>
                {!props.compact && <span className="truncate text-xs text-muted">{a.service_name}</span>}
              </span>
            ) : (
              <>
                <span className="t font-mono text-[11px]">
                  {hm(startMin)}
                  {!props.compact && `–${hm(startMin + len)}${a.source === "online" ? " · online" : ""}`}
                </span>
                <span className={`truncate font-semibold ${props.compact ? "text-xs" : "text-[13px]"}`}>{a.license_plate ?? a.customer?.name ?? "–"}</span>
                {!props.compact && ht > 44 && a.license_plate && <span className="truncate text-xs text-muted">{a.customer?.name}</span>}
                {!props.compact && ht > 58 && <span className="truncate text-xs text-muted">{a.service_name}</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
