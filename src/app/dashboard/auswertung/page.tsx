"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { addDays, atLocal, dayHours, euro, parseRange, toMin, weekStart, weekday, zonedDate } from "@/lib/time";
import { useSalon } from "../salon-context";

type Period = "week" | "month" | "quarter" | "year";
const PERIODS: [Period, string][] = [["week", "Woche"], ["month", "Monat"], ["quarter", "Quartal"], ["year", "Jahr"]];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WEEKDAYS = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"], [6, "Sa"], [0, "So"]] as const;

type Row = {
  id: string;
  staff_id: string;
  customer_id: string;
  service_id: string | null;
  service_ids: string[] | null;
  service_name: string;
  price_cents: number;
  status: string;
  source: string;
  start: Date;
  end: Date;
  newCustomer: boolean;
};

const ym = (d: string) => d.slice(0, 7);
const monthStart = (d: string) => `${ym(d)}-01`;
const addMonths = (d: string, n: number) => {
  const [y, m] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 10);
};

/** [from, to) as dates for the period containing `anchor`. */
function bounds(period: Period, anchor: string): [string, string] {
  if (period === "week") return [weekStart(anchor), addDays(weekStart(anchor), 7)];
  if (period === "month") return [monthStart(anchor), addMonths(monthStart(anchor), 1)];
  if (period === "quarter") {
    const [y, m] = anchor.split("-").map(Number);
    const q = `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
    return [q, addMonths(q, 3)];
  }
  return [`${anchor.slice(0, 4)}-01-01`, `${Number(anchor.slice(0, 4)) + 1}-01-01`];
}
const shift = (period: Period, anchor: string, dir: number) =>
  period === "week" ? addDays(anchor, 7 * dir) : addMonths(monthStart(anchor), dir * (period === "month" ? 1 : period === "quarter" ? 3 : 12));

function label(period: Period, from: string, to: string) {
  const last = addDays(to, -1);
  const d = (x: string) => `${Number(x.slice(8))}.${Number(x.slice(5, 7))}.`;
  if (period === "week") return `${d(from)} – ${d(last)}${last.slice(0, 4)}`;
  if (period === "month") return `${["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`;
  if (period === "quarter") return `Q${Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1} ${from.slice(0, 4)}`;
  return from.slice(0, 4);
}

async function load(salonId: string, from: Date, to: Date) {
  const { data, error } = await browserClient()
    .from("appointments")
    .select("id,staff_id,customer_id,service_id,service_ids,service_name,price_cents,status,source,during,payment_status,payment_expires_at,customers(created_at)")
    .eq("salon_id", salonId)
    .filter("during", "ov", `[${from.toISOString()},${to.toISOString()})`);
  if (error) throw error;
  return (data ?? []).flatMap((r: unknown) => {
    const row = r as Omit<Row, "start" | "end" | "newCustomer"> & { during: string; payment_status: string | null; payment_expires_at: string | null; customers: { created_at: string } | null };
    // unpaid deposit holds never count
    if (row.payment_status === "pending" || row.payment_status === "expired") return [];
    const [start, end] = parseRange(row.during);
    if (start < from || start >= to) return [];
    const created = row.customers ? new Date(row.customers.created_at) : null;
    return [{ ...row, start, end, newCustomer: !!created && created >= from && created < to } as Row];
  });
}

function summarize(rows: Row[], now: Date) {
  const valid = rows.filter((r) => r.status !== "storniert");
  const past = valid.filter((r) => r.start < now);
  const noShows = past.filter((r) => r.status === "nicht_erschienen").length;
  const earning = valid.filter((r) => r.status !== "nicht_erschienen");
  const customers = new Set(valid.map((r) => r.customer_id));
  const fresh = new Set(valid.filter((r) => r.newCustomer).map((r) => r.customer_id));
  return {
    revenue: earning.filter((r) => r.start < now).reduce((n, r) => n + r.price_cents, 0),
    planned: earning.filter((r) => r.start >= now).reduce((n, r) => n + r.price_cents, 0),
    count: valid.length,
    cancelled: rows.filter((r) => r.status === "storniert").length,
    noShowRate: past.length ? noShows / past.length : null,
    noShows,
    online: valid.length ? valid.filter((r) => r.source === "online").length / valid.length : null,
    customers: customers.size,
    newCustomers: fresh.size,
  };
}

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)} %`);

export default function AnalyticsPage() {
  const { salon, staff, services, hours, closures } = useSalon();
  const tz = salon.timezone;
  const today = zonedDate(new Date(), tz);
  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState(today);
  const [from, to] = bounds(period, anchor);
  const [prevFrom] = bounds(period, shift(period, anchor, -1));
  const key = `${salon.id}|${from}|${to}`;
  const [data, setData] = useState<{ key: string; rows: Row[]; prev: Row[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const f = atLocal(from, 0, tz), t = atLocal(to, 0, tz), pf = atLocal(prevFrom, 0, tz);
    Promise.all([load(salon.id, f, t), load(salon.id, pf, f)])
      .then(([rows, prev]) => live && (setData({ key, rows, prev }), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [key, salon.id, from, to, prevFrom, tz]);

  const current = data?.key === key ? data : null;
  const now = new Date();
  const s = current ? summarize(current.rows, now) : null;
  const p = current ? summarize(current.prev, atLocal(from, 0, tz)) : null;
  const valid = current?.rows.filter((r) => r.status !== "storniert") ?? [];
  const earning = valid.filter((r) => r.status !== "nicht_erschienen");

  // revenue over time: days (week/month), weeks (quarter), months (year)
  const buckets: { key: string; label: string; cents: number; future: boolean }[] = [];
  if (period === "year") {
    for (let m = 0; m < 12; m++) buckets.push({ key: addMonths(from, m).slice(0, 7), label: MONTHS[m], cents: 0, future: addMonths(from, m) > today });
  } else if (period === "quarter") {
    for (let d = weekStart(from); d < to; d = addDays(d, 7)) buckets.push({ key: d, label: `${Number(d.slice(8))}.${Number(d.slice(5, 7))}.`, cents: 0, future: d > today });
  } else {
    for (let d = from; d < to; d = addDays(d, 1)) buckets.push({ key: d, label: period === "week" ? WEEKDAYS.find(([w]) => w === weekday(d))![1] : String(Number(d.slice(8))), cents: 0, future: d > today });
  }
  for (const r of earning) {
    const d = zonedDate(r.start, tz);
    const k = period === "year" ? d.slice(0, 7) : period === "quarter" ? weekStart(d) : d;
    const b = buckets.find((x) => x.key === k);
    if (b) b.cents += r.price_cents;
  }

  // utilization: booked minutes / open minutes per person (holidays and special days respected)
  let openPerPerson = 0;
  for (let d = from; d < to; d = addDays(d, 1)) for (const iv of dayHours(hours, d, closures)) openPerPerson += toMin(iv.closes) - toMin(iv.opens);
  const people = staff
    .filter((st) => st.active || valid.some((r) => r.staff_id === st.id))
    .map((st) => {
      const booked = valid.filter((r) => r.staff_id === st.id).reduce((n, r) => n + (r.end.getTime() - r.start.getTime()) / 60000, 0);
      return { id: st.id, name: st.name, booked, share: openPerPerson ? Math.min(booked / openPerPerson, 1) : 0 };
    });

  // services: combined bookings count for every part, revenue split by base price
  const svc = new Map<string, { name: string; count: number; cents: number }>();
  for (const r of valid) {
    const ids = r.service_ids?.length ? r.service_ids : r.service_id ? [r.service_id] : [];
    const parts = ids.map((id) => services.find((x) => x.id === id)).filter((x) => !!x);
    const base = parts.reduce((n, x) => n + x.price_cents, 0);
    if (!parts.length) {
      const e = svc.get(r.service_name) ?? { name: r.service_name, count: 0, cents: 0 };
      e.count++;
      if (r.status !== "nicht_erschienen") e.cents += r.price_cents;
      svc.set(r.service_name, e);
      continue;
    }
    for (const x of parts) {
      const e = svc.get(x.id) ?? { name: x.name, count: 0, cents: 0 };
      e.count++;
      if (r.status !== "nicht_erschienen") e.cents += base ? Math.round((r.price_cents * x.price_cents) / base) : Math.round(r.price_cents / parts.length);
      svc.set(x.id, e);
    }
  }
  const topServices = [...svc.values()].sort((a, b) => b.count - a.count || b.cents - a.cents).slice(0, 6);

  const byWeekday = WEEKDAYS.map(([w, l]) => ({ label: l, count: valid.filter((r) => weekday(zonedDate(r.start, tz)) === w).length }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <span className="label">Auswertung</span>
          <h1 className="text-3xl font-semibold sm:text-4xl">{label(period, from, to)}</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex w-full rounded-xl border border-line bg-card p-1 sm:w-auto" role="tablist" aria-label="Zeitraum">
            {PERIODS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={period === k} onClick={() => { setPeriod(k); setAnchor(today); }}
                className="flex-1 rounded-[9px] px-3 py-1.5 text-sm font-medium text-muted aria-selected:bg-fg/7 aria-selected:text-fg sm:flex-none">
                {l}
              </button>
            ))}
          </div>
          <button className="icon-btn" aria-label="Vorheriger Zeitraum" onClick={() => setAnchor(shift(period, anchor, -1))}><ChevronLeft size={18} /></button>
          <button className="btn btn-sm" onClick={() => setAnchor(today)} disabled={from <= today && today < to}>Aktuell</button>
          <button className="icon-btn" aria-label="Nächster Zeitraum" onClick={() => setAnchor(shift(period, anchor, 1))}><ChevronRight size={18} /></button>
        </div>
      </div>

      {failed && <p className="text-sm text-danger">Daten konnten nicht geladen werden. Bitte Seite neu laden.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Umsatz" value={s ? euro(s.revenue) : "…"} sub={s && s.planned ? `+ ${euro(s.planned)} geplant` : "ohne abgesagte und nicht erschienene"} delta={s && p ? change(s.revenue + s.planned, p.revenue + p.planned) : null} />
        <Tile label="Termine" value={s ? String(s.count) : "…"} sub={s ? `${s.cancelled} abgesagt · ${pct(s.online)} online gebucht` : ""} delta={s && p ? change(s.count, p.count) : null} />
        <Tile label="Nicht erschienen" value={s ? pct(s.noShowRate) : "…"} sub={s ? `${s.noShows} ${s.noShows === 1 ? "Termin" : "Termine"} bisher` : ""} delta={s && p && s.noShowRate !== null && p.noShowRate !== null ? { diff: s.noShowRate - p.noShowRate, points: true } : null} upIsBad />
        <Tile label="Neue Kunden" value={s ? String(s.newCustomers) : "…"} sub={s ? `von ${s.customers} ${s.customers === 1 ? "Kunde" : "Kunden"} insgesamt` : ""} delta={s && p ? change(s.newCustomers, p.newCustomers) : null} />
      </div>

      <section className="card grid gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Umsatz im Verlauf</h2>
          <span className="text-xs text-muted">{period === "year" ? "je Monat" : period === "quarter" ? "je Woche" : "je Tag"} · heller = geplant</span>
        </div>
        <Columns data={buckets.map((b) => ({ label: b.label, value: b.cents, muted: b.future, text: euro(b.cents) }))} format={(v) => euro(v)} dense={period === "month"} />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-fg">Als Tabelle anzeigen</summary>
          <table className="mt-2 w-full max-w-md text-sm tabular-nums">
            <tbody>{buckets.map((b) => <tr key={b.key} className="border-b border-line last:border-0"><td className="py-1 text-muted">{b.key}</td><td className="py-1 text-right">{euro(b.cents)}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card grid content-start gap-4 p-5 sm:p-6">
          <div className="grid gap-1">
            <h2 className="text-[15px] font-semibold">Auslastung je Person</h2>
            <p className="text-xs text-muted">Gebuchte Zeit im Verhältnis zu den Öffnungszeiten ({Math.round(openPerPerson / 60)} Std.), Feiertage und Urlaub abgezogen.</p>
          </div>
          {people.length === 0 ? <p className="text-sm text-muted">Noch kein Team eingetragen.</p> : (
            <div className="grid gap-3">
              {people.map((x) => (
                <Bar key={x.id} label={x.name} share={x.share} value={pct(openPerPerson ? x.booked / openPerPerson : null)} hint={`${Math.round(x.booked / 60)} Std. gebucht`} />
              ))}
            </div>
          )}
        </section>

        <section className="card grid content-start gap-4 p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold">Beliebteste Leistungen</h2>
          {topServices.length === 0 ? <p className="text-sm text-muted">In diesem Zeitraum noch keine Termine.</p> : (
            <div className="grid gap-3">
              {topServices.map((x) => (
                <Bar key={x.name} label={x.name} share={x.count / topServices[0].count} value={`${x.count}×`} hint={euro(x.cents)} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card grid gap-4 p-5 sm:p-6">
        <div className="grid gap-1">
          <h2 className="text-[15px] font-semibold">Termine nach Wochentag</h2>
          <p className="text-xs text-muted">Zeigt, wann es voll ist und wo noch Luft für Aktionen ist.</p>
        </div>
        <Columns data={byWeekday.map((d) => ({ label: d.label, value: d.count, text: `${d.count} ${d.count === 1 ? "Termin" : "Termine"}` }))} format={(v) => String(v)} />
      </section>
    </div>
  );
}

function change(cur: number, prev: number) {
  if (!prev) return cur ? { diff: 1, points: false, fresh: true } : null;
  return { diff: (cur - prev) / prev, points: false };
}

function Tile(props: { label: string; value: string; sub: string; delta: { diff: number; points: boolean; fresh?: boolean } | null; upIsBad?: boolean }) {
  const d = props.delta;
  const up = d ? d.diff > 0 : false;
  const flat = !d || Math.abs(d.diff) < 0.005;
  const good = props.upIsBad ? !up : up;
  return (
    <div className="card grid content-start gap-1.5 p-4 sm:p-5">
      <span className="label">{props.label}</span>
      <span className="text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">{props.value}</span>
      <span className="text-xs text-muted">{props.sub}</span>
      {d && !d.fresh && (
        <span className={`flex items-center gap-1 text-xs font-medium ${flat ? "text-muted" : good ? "text-accent" : "text-danger"}`}>
          {!flat && (up ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
          {flat ? "wie im Vorzeitraum" : `${up ? "+" : "−"}${Math.round(Math.abs(d.diff) * 100)}${d.points ? " Prozentpunkte" : " %"} zum Vorzeitraum`}
        </span>
      )}
    </div>
  );
}

/** Horizontal meter: accent fill on a lighter track, value and hint in text tokens. */
function Bar({ label, share, value, hint }: { label: string; share: number; value: string; hint: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums"><span className="font-medium">{value}</span> <span className="text-muted">· {hint}</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-accent/12">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  );
}

/** Single-series column chart with hover/focus tooltip; future buckets in a lighter step. */
function Columns({ data, format, dense }: { data: { label: string; value: number; text: string; muted?: boolean }[]; format: (v: number) => string; dense?: boolean }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const top = niceMax(max);
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3">
      <div className="flex h-44 flex-col justify-between text-right text-[11px] tabular-nums text-dim">
        <span>{format(top)}</span>
        <span>{format(top / 2)}</span>
        <span>{format(0)}</span>
      </div>
      <div className="relative h-44">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <div className="border-t border-line" /><div className="border-t border-line" /><div className="border-t border-line" />
        </div>
        <div className="absolute inset-0 flex items-end gap-0.5">
          {data.map((d, i) => (
            <div key={i} tabIndex={0} aria-label={`${d.label}: ${d.text}`} className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none">
              <div
                className={`w-full max-w-6 rounded-t-[4px] transition-colors group-hover:bg-accent group-focus-visible:bg-accent ${d.muted ? "bg-accent/35" : "bg-accent/80"}`}
                style={{ height: top ? `${(d.value / top) * 100}%` : 0, minHeight: d.value ? 2 : 0 }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-card px-2 py-1 text-xs shadow-lg group-hover:block group-focus-visible:block">
                <span className="text-muted">{d.label}</span> <span className="font-medium tabular-nums">{d.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div />
      <div className="mt-1.5 flex gap-0.5 text-[11px] text-dim">
        {data.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 whitespace-nowrap text-center">{!dense || i % 7 === 0 ? d.label : ""}</span>
        ))}
      </div>
    </div>
  );
}

/** Clean axis maximum (1, 2, 2.5, 5 × 10^n). */
function niceMax(v: number) {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}
