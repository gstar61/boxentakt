"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { rescheduleAction, rescheduleSlotsAction } from "@/app/actions";
import { addDays, dayHours, fullDateTime, shortDay, shortMonth, zonedDate, zonedTime, type Closures, type Hours } from "@/lib/time";

/** Pick a new day and time for the same person and duration; the old slot is released. */
export default function RescheduleBox(p: { token: string; tz: string; hours: Hours[]; closures: Closures; bookingDays: number }) {
  const [open, setOpen] = useState(false);
  const [today] = useState(() => zonedDate(new Date(), p.tz));
  const days = Array.from({ length: Math.min(p.bookingDays, 28) + 1 }, (_, i) => addDays(today, i));
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ day: string; list: string[] } | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!day) return;
    let live = true;
    rescheduleSlotsAction(p.token, day).then((list) => live && setSlots({ day, list }));
    return () => {
      live = false;
    };
  }, [day, p.token]);

  if (done)
    return <p className="text-accent">Der Termin ist verschoben auf {fullDateTime(done, p.tz)}. Eine Bestätigung kommt per E-Mail.</p>;

  if (!open)
    return (
      <button className="btn btn-primary w-fit" onClick={() => setOpen(true)}>
        <CalendarClock size={18} /> Termin verschieben
      </button>
    );

  const list = slots?.day === day ? slots.list : null;
  return (
    <div className="grid gap-4 rounded-[14px] border border-line bg-card-2 p-4">
      <span className="label">Neuer Tag</span>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const closed = dayHours(p.hours, d, p.closures).length === 0;
          return (
            <button
              key={d}
              disabled={closed}
              aria-pressed={d === day}
              onClick={() => { setDay(d); setPick(null); setError(null); }}
              className="grid w-[58px] flex-none justify-items-center gap-0.5 rounded-xl border border-line bg-card py-2 disabled:cursor-not-allowed disabled:opacity-35 aria-pressed:border-accent aria-pressed:bg-accent/10"
            >
              <span className="text-[11px] uppercase tracking-wider text-muted">{d === today ? "Heute" : shortDay(d)}</span>
              <span className="text-lg font-semibold tabular-nums">{Number(d.slice(8))}</span>
              <span className="text-[11px] text-muted">{shortMonth(d)}</span>
            </button>
          );
        })}
      </div>
      {day &&
        (!list ? (
          <p className="text-sm text-muted">Freie Zeiten werden geladen …</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted">An diesem Tag ist nichts mehr frei. Bitte einen anderen Tag wählen.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
            {list.map((iso) => (
              <button
                key={iso}
                aria-pressed={iso === pick}
                onClick={() => { setPick(iso); setError(null); }}
                className="h-[40px] rounded-[11px] border border-line-2 text-sm tabular-nums hover:border-accent hover:text-accent aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-ink"
              >
                {zonedTime(iso, p.tz)}
              </button>
            ))}
          </div>
        ))}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          className="btn btn-primary"
          disabled={!pick || pending}
          onClick={() =>
            pick &&
            start(async () => {
              const r = await rescheduleAction(p.token, pick);
              if (r.ok) setDone(pick);
              else {
                setError(r.error);
                setSlots(null);
                rescheduleSlotsAction(p.token, day!).then((l) => setSlots({ day: day!, list: l }));
              }
            })
          }
        >
          {pending ? "Wird verschoben …" : pick ? `Auf ${zonedTime(pick, p.tz)} Uhr verschieben` : "Zeit wählen"}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
      </div>
    </div>
  );
}
