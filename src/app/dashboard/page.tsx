"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Ban, CalendarOff, ChevronLeft, ChevronRight, Moon, Plus, Warehouse } from "lucide-react";
import { addDays, atLocal, dayMonth, euro, hm, dayHours, dayNote, longDate, shortDay, toMin, weekStart, zonedDate, zonedMinutes } from "@/lib/time";
import { useSalon } from "./salon-context";
import { Legend, Stat } from "./ui";
import { loadRange, type Absence, type Appt } from "./_cal/data";
import { Lane } from "./_cal/Lane";
import { AppointmentDrawer } from "./_cal/AppointmentDrawer";
import { CreateDialog } from "./_cal/CreateDialog";
import { AbsenceDialog, AbsenceDrawer } from "./_cal/AbsenceDialog";
import { WaitlistCard } from "./_cal/WaitlistCard";

type View = "day" | "week";

const PHONE = "(max-width: 639px)";
const subscribePhone = (cb: () => void) => {
  const m = window.matchMedia(PHONE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export default function CalendarPage() {
  const { salon, staff, services, hours, closures, resources } = useSalon();
  const tz = salon.timezone;
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(() => zonedDate(new Date(), tz));
  const first = view === "day" ? date : weekStart(date);
  const last = view === "day" ? date : addDays(first, 6);
  const days = view === "day" ? [date] : Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const key = `${first}|${last}`;
  const [data, setData] = useState<{ key: string; appts: Appt[]; absences: Absence[] } | null>(null);
  const [open, setOpen] = useState<{ kind: "appt" | "absence"; id: string } | { kind: "create"; date: string; staffId: string; min: number | null } | { kind: "newAbsence" } | null>(null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [now, setNow] = useState(() => new Date());

  const salonId = salon.id;
  const load = useCallback(async () => {
    try {
      const r = await loadRange(salonId, atLocal(first, 0, tz), atLocal(addDays(last, 1), 0, tz));
      setData({ key: `${first}|${last}`, ...r });
    } catch {
      setToast({ text: "Termine konnten nicht geladen werden.", err: true });
    }
  }, [salonId, first, last, tz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after the request resolves
    load();
    const t = setInterval(() => { load(); setNow(new Date()); }, 60_000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const current = data?.key === key ? data : null;
  const appts = current?.appts ?? [];
  const absences = current?.absences ?? [];
  const active = appts.filter((a) => a.status !== "storniert");
  const cancelled = appts.filter((a) => a.status === "storniert");
  const columns = staff.filter((s) => s.active || active.some((a) => a.staff_id === s.id));
  // phones show one person per day by default (columns would be too narrow), "Alle" brings back all
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);
  const [focus, setFocus] = useState<string | null>(null);
  // Tagesansicht nach Mitarbeitern oder nach Plätzen (Hebebühne …)
  const [lanes, setLanes] = useState<"staff" | "places">("staff");
  const placeCols = resources.filter((r) => r.active || active.some((a) => a.resource_id === r.id));
  const byPlace = lanes === "places" && view === "day" && placeCols.length > 0;
  const laneOf = (a: Appt) => (byPlace ? a.resource_id : a.staff_id);
  const withoutPlace = byPlace ? active.filter((a) => !a.resource_id).length : 0;
  const focused = focus === "all" ? null : columns.find((c) => c.id === focus) ?? columns[0];
  const dayColumns: { id: string; name: string }[] = byPlace ? placeCols : phone && view === "day" && focused && columns.length > 1 ? [focused] : columns;
  const revenue = active.filter((a) => a.status !== "nicht_erschienen").reduce((n, a) => n + a.price_cents, 0);
  const noShows = active.filter((a) => a.status === "nicht_erschienen").length;
  const today = zonedDate(now, tz);
  const nowMin = zonedMinutes(now, tz);
  const anyOpen = days.some((d) => dayHours(hours, d, closures).length);

  // visible hours: widest opening hours of the shown days, widened by appointments
  let lo = Infinity, hi = -Infinity;
  for (const d of days) for (const iv of dayHours(hours, d, closures)) { lo = Math.min(lo, toMin(iv.opens)); hi = Math.max(hi, toMin(iv.closes)); }
  if (lo === Infinity) { lo = 9 * 60; hi = 18 * 60; }
  for (const a of active) {
    const s = zonedMinutes(a.start, tz);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s + (a.end.getTime() - a.start.getTime()) / 60000);
  }
  const range = [Math.floor(lo / 60) * 60, Math.min(Math.ceil(hi / 60) * 60, 24 * 60)] as const;
  const px = view === "day" ? 1.3 : 1;
  const labels = Array.from({ length: (range[1] - range[0]) / 60 + 1 }, (_, i) => range[0] + i * 60);

  const onDay = (d: string) => (a: { start: Date }) => zonedDate(a.start, tz) === d;
  const absencesFor = (d: string, staffId: string) => {
    const s = atLocal(d, 0, tz).getTime();
    const e = atLocal(addDays(d, 1), 0, tz).getTime();
    return absences.filter((ab) => (ab.staff_id === null || ab.staff_id === staffId) && ab.start.getTime() < e && ab.end.getTime() > s);
  };

  const step = (n: number) => setDate(addDays(date, view === "day" ? n : 7 * n));
  const changed = (text: string, err?: boolean) => {
    setToast({ text, err });
    if (!err) setOpen(null);
    load();
  };
  const selectedAppt = open?.kind === "appt" ? appts.find((a) => a.id === open.id) : undefined;
  const selectedAbsence = open?.kind === "absence" ? absences.find((a) => a.id === open.id) : undefined;

  const timeAxis = (
    <div className="relative border-r border-line" style={{ height: (range[1] - range[0]) * px + 8 }}>
      {labels.map((t) => (
        <span key={t} className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-dim" style={{ top: (t - range[0]) * px }}>{hm(t)}</span>
      ))}
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <span className="label">{view === "day" ? (date === today ? "Heute" : "Tagesansicht") : "Wochenansicht"}</span>
          <h1 className="text-3xl font-semibold sm:text-4xl">{view === "day" ? longDate(date) : `${dayMonth(first)} – ${dayMonth(last)}`}</h1>
          {view === "day" && dayNote(date, closures) && (
            <span className="flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[13px] font-medium text-accent">
              <CalendarOff size={14} /> {dayNote(date, closures)}{dayHours(hours, date, closures).length ? "" : " – online geschlossen"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-card p-1" role="tablist" aria-label="Ansicht">
            {(["day", "week"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className="rounded-[9px] px-3 py-1.5 text-sm font-medium text-muted aria-selected:bg-fg/8 aria-selected:text-fg">
                {v === "day" ? "Tag" : "Woche"}
              </button>
            ))}
          </div>
          <button className="icon-btn" aria-label="Zurück" onClick={() => step(-1)}><ChevronLeft size={18} /></button>
          <button className="btn btn-sm" onClick={() => setDate(today)}>Heute</button>
          <button className="icon-btn" aria-label="Weiter" onClick={() => step(1)}><ChevronRight size={18} /></button>
          <input type="date" aria-label="Datum wählen" className="input input-sm w-auto font-mono" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="btn btn-sm" onClick={() => setOpen({ kind: "newAbsence" })}><Ban size={16} /> Abwesenheit</button>
          <button className="btn btn-primary" disabled={!columns.length} onClick={() => setOpen({ kind: "create", date, staffId: columns[0]?.id ?? "", min: null })}>
            <Plus size={18} /> Termin eintragen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label={view === "day" ? "Termine" : "Termine Woche"} value={String(active.length)} />
        <Stat label="Umsatz" value={euro(revenue)} />
        <Stat label="Nicht erschienen" value={String(noShows)} danger={noShows > 0} />
      </div>

      {view === "day" && <WaitlistCard salonId={salon.id} date={date} />}

      {!anyOpen && active.length === 0 && absences.length === 0 ? (
        <p className="empty card !border-solid"><Moon size={18} /> {view === "day" ? "An diesem Tag ist geschlossen." : "In dieser Woche ist geschlossen."} Öffnungszeiten lassen sich unter „Leistungen“ ändern.</p>
      ) : view === "day" ? (
        <div className="grid gap-3">
        {view === "day" && placeCols.length > 0 && (
          <div className="flex w-fit rounded-xl border border-line bg-card p-1" role="tablist" aria-label="Spalten">
            {([["staff", "Mitarbeiter"], ["places", "Plätze"]] as const).map(([v, label]) => (
              <button key={v} role="tab" aria-selected={lanes === v} onClick={() => setLanes(v)}
                className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-sm font-medium text-muted aria-selected:bg-fg/8 aria-selected:text-fg">
                {v === "places" && <Warehouse size={14} />}{label}
              </button>
            ))}
          </div>
        )}
        {phone && !byPlace && columns.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Person">
            {[...columns, { id: "all", name: "Alle" }].map((c) => (
              <button key={c.id} className="pill shrink-0 !h-9" aria-pressed={c.id === "all" ? focus === "all" : focused?.id === c.id} onClick={() => setFocus(c.id)}>
                {c.name}
                {c.id !== "all" && <span className="ml-1.5 text-xs text-muted tabular-nums">{active.filter((a) => a.staff_id === c.id).length}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="card overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `${phone ? 48 : 58}px repeat(${dayColumns.length}, minmax(${dayColumns.length > 1 ? 150 : 0}px, 1fr))` }}>
            <div className="border-b border-r border-line" />
            {dayColumns.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-2.5 border-b border-line px-3 py-3.5 font-medium ${i ? "border-l" : ""}`}>
                <span className="grid size-6.5 place-items-center rounded-lg bg-fg/7 text-xs font-semibold text-muted">{s.name.slice(0, 1).toUpperCase()}</span>
                {s.name}
                <span className="ml-auto font-mono text-xs text-muted">{active.filter((a) => laneOf(a) === s.id).length}</span>
              </div>
            ))}
            {timeAxis}
            {dayColumns.map((s, i) => (
              <Lane
                key={s.id}
                className={i ? "border-l border-line" : ""}
                date={date} tz={tz} range={range} px={px} step={salon.slot_step}
                intervals={dayHours(hours, date, closures)}
                appts={active.filter((a) => laneOf(a) === s.id)}
                absences={byPlace ? [] : absencesFor(date, s.id)}
                nowMin={date === today ? nowMin : null}
                onEmpty={(min) => setOpen({ kind: "create", date, staffId: byPlace ? columns[0]?.id ?? "" : s.id, min })}
                onOpenAppt={(id) => setOpen({ kind: "appt", id })}
                onOpenAbsence={(id) => setOpen({ kind: "absence", id })}
              />
            ))}
          </div>
        </div>
        {withoutPlace > 0 && <p className="text-xs text-muted">{withoutPlace} {withoutPlace === 1 ? "Termin braucht" : "Termine brauchen"} keinen Platz und {withoutPlace === 1 ? "steht" : "stehen"} nur in der Mitarbeiter-Ansicht.</p>}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[880px]" style={{ gridTemplateColumns: "58px repeat(7, minmax(0, 1fr))" }}>
            <div className="border-b border-r border-line" />
            {days.map((d, i) => (
              <button
                key={d}
                onClick={() => { setDate(d); setView("day"); }}
                className={`grid justify-items-start gap-0.5 border-b border-line px-3 py-2.5 text-left hover:bg-fg/3 ${i ? "border-l" : ""} ${d === today ? "text-accent" : ""}`}
              >
                <span className="text-[11px] uppercase tracking-wider text-muted">{shortDay(d)}</span>
                <span className="flex w-full items-baseline justify-between font-medium">
                  {dayMonth(d)}
                  <span className="font-mono text-xs text-muted">{active.filter(onDay(d)).length || ""}</span>
                </span>
                {dayNote(d, closures) && <span className="max-w-full truncate text-[11px] text-accent">{dayNote(d, closures)}</span>}
              </button>
            ))}
            {timeAxis}
            {days.map((d, i) => (
              <div key={d} className={`grid ${i ? "border-l border-line" : ""}`} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
                {columns.map((s, j) => (
                  <Lane
                    key={s.id}
                    compact
                    className={j ? "border-l border-dashed border-line" : ""}
                    date={d} tz={tz} range={range} px={px} step={salon.slot_step}
                    intervals={dayHours(hours, d, closures)}
                    appts={active.filter((a) => a.staff_id === s.id && onDay(d)(a))}
                    absences={absencesFor(d, s.id)}
                    nowMin={d === today ? nowMin : null}
                    onEmpty={(min) => setOpen({ kind: "create", date: d, staffId: s.id, min })}
                    onOpenAppt={(id) => setOpen({ kind: "appt", id })}
                    onOpenAbsence={(id) => setOpen({ kind: "absence", id })}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <Legend cls="border-accent/50 bg-accent/14" label="Gebucht" />
        <Legend cls="border-slate-400/40 bg-slate-400/12" label="Erschienen" />
        <Legend cls="border-danger/50 bg-danger/12" label="Nicht erschienen" />
        <Legend cls="border-dashed border-line-2" label="Abwesend" />
        {view === "week" && columns.length > 1 && <span>Spalten pro Tag: {columns.map((c) => c.name).join(" · ")}</span>}
        <span>Leere Stelle anklicken zum Eintragen</span>
      </div>

      {cancelled.length > 0 && (
        <div className="grid gap-1.5 text-sm text-muted">
          <span className="label">Storniert ({cancelled.length})</span>
          {cancelled.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <s className="font-mono text-dim">{view === "week" && `${dayMonth(zonedDate(a.start, tz))} `}{hm(zonedMinutes(a.start, tz))}</s>
              <s className="text-dim">{a.customer?.name} · {a.service_name}</s>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen({ kind: "appt", id: a.id })}>Öffnen</button>
            </div>
          ))}
        </div>
      )}

      {selectedAppt && (
        <AppointmentDrawer key={selectedAppt.id} appt={selectedAppt} salonId={salon.id} tz={tz} step={salon.slot_step} staff={columns}
          onClose={() => setOpen(null)} onChanged={changed} />
      )}
      {selectedAbsence && (
        <AbsenceDrawer absence={selectedAbsence} tz={tz}
          staffName={selectedAbsence.staff_id ? staff.find((s) => s.id === selectedAbsence.staff_id)?.name ?? "" : "Ganzer Betrieb"}
          onClose={() => setOpen(null)} onDeleted={() => changed("Abwesenheit gelöscht")} />
      )}
      {open?.kind === "create" && (
        <CreateDialog salonId={salon.id} tz={tz} step={salon.slot_step} initial={open} staff={columns}
          services={services.filter((s) => s.active)} onClose={() => setOpen(null)} onCreated={() => changed("Termin eingetragen")} />
      )}
      {open?.kind === "newAbsence" && (
        <AbsenceDialog salonId={salon.id} tz={tz} date={date} staff={columns.filter((s) => s.active)} onClose={() => setOpen(null)} onSaved={(t) => changed(t)} />
      )}

      {toast && (
        <div role="status" className={`fixed bottom-24 left-1/2 md:bottom-5 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl ${toast.err ? "bg-danger text-danger-ink" : "bg-fg text-bg"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
