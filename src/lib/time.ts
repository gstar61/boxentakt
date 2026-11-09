import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { de } from "date-fns/locale";

export type Hours = { weekday: number; opens: string; closes: string };
export type Busy = { staff_id: string; starts_at: string; ends_at: string };
export type ResourceBusy = { resource_id: string; starts_at: string; ends_at: string };

/** Platz-Priorität bei mehreren Leistungen: Hebebühne vor Wuchtmaschine vor Sonstigem (wie in book_services). */
const KIND_RANK = { buehne: 1, wuchtmaschine: 2, sonstige: 3 } as const;
export function neededKind(kinds: (keyof typeof KIND_RANK | null | undefined)[]) {
  return kinds.filter((k): k is keyof typeof KIND_RANK => !!k).sort((a, b) => KIND_RANK[a] - KIND_RANK[b])[0] ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Calendar date (YYYY-MM-DD) in the salon's time zone. */
export const zonedDate = (d: Date, tz: string) => formatInTimeZone(d, tz, "yyyy-MM-dd");
export const zonedTime = (d: Date | string, tz: string) => formatInTimeZone(new Date(d), tz, "HH:mm");
export const zonedMinutes = (d: Date | string, tz: string) => toMin(zonedTime(d, tz));
/** Wall-clock time in the salon's zone → absolute instant. */
export const atLocal = (date: string, min: number, tz: string) => fromZonedTime(`${date}T${hm(min)}:00`, tz);

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
/** All opening intervals of a day, sorted (several when there is a break). */
export const hoursOn = (hours: Hours[], date: string) =>
  hours.filter((h) => h.weekday === weekday(date)).sort((a, b) => toMin(a.opens) - toMin(b.opens));

/** Holidays (closed online) and special days (closed or other hours) – a special day wins over a holiday. */
export type SpecialDay = { day: string; opens: string | null; closes: string | null; note: string | null };
export type Holiday = { day: string; name: string };
export type Closures = { holidays?: Holiday[]; special_days?: SpecialDay[] };

/** Actual opening intervals of a date: special day > public holiday > weekly hours. */
export function dayHours(hours: Hours[], date: string, c?: Closures): Hours[] {
  const sp = c?.special_days?.find((d) => d.day === date);
  if (sp) return sp.opens && sp.closes ? [{ weekday: weekday(date), opens: sp.opens, closes: sp.closes }] : [];
  if (c?.holidays?.some((h) => h.day === date)) return [];
  return hoursOn(hours, date);
}

/** Short reason why a date differs from the weekly hours, or null. */
export function dayNote(date: string, c?: Closures): string | null {
  const sp = c?.special_days?.find((d) => d.day === date);
  if (sp) return sp.note || (sp.opens ? `Sonderöffnung ${sp.opens}–${sp.closes}` : "Geschlossen");
  return c?.holidays?.find((h) => h.day === date)?.name ?? null;
}

/** Consecutive days with the same hours and note merged into one range (vacation as "2.–4. Nov."). */
export function groupDays<T extends { day: string; opens: string | null; closes: string | null; note: string | null }>(days: T[]) {
  const out: { from: string; to: string; opens: string | null; closes: string | null; note: string | null }[] = [];
  for (const d of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === d.day && last.opens === d.opens && last.closes === d.closes && last.note === d.note) last.to = d.day;
    else out.push({ from: d.day, to: d.day, opens: d.opens, closes: d.closes, note: d.note });
  }
  return out;
}

export const longDate = (date: string) =>
  formatInTimeZone(new Date(`${date}T12:00:00Z`), "UTC", "EEEE, d. MMMM", { locale: de });
export const shortDay = (date: string) =>
  formatInTimeZone(new Date(`${date}T12:00:00Z`), "UTC", "EEEEEE", { locale: de });
export const dayMonth = (date: string) =>
  formatInTimeZone(new Date(`${date}T12:00:00Z`), "UTC", "d. MMM", { locale: de });
/** Monday of the week containing `date`. */
export const weekStart = (date: string) => addDays(date, -((weekday(date) + 6) % 7));
export const shortMonth = (date: string) =>
  formatInTimeZone(new Date(`${date}T12:00:00Z`), "UTC", "MMM", { locale: de });
export const fullDateTime = (d: Date | string, tz: string) =>
  formatInTimeZone(new Date(d), tz, "EEEE, d. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de });

export const euroFrom = (cents: number) => `ab ${euro(cents)}`;
/** "55 €" for whole euros, "24,50 €" otherwise. */
export const euro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: (cents || 0) % 100 ? 2 : 0 }).format((cents || 0) / 100);
export const duration = (m: number) =>
  m < 60 ? `${m} Min.` : m % 60 ? `${Math.floor(m / 60)} Std. ${m % 60} Min.` : `${m / 60} Std.`;

/** Free start times for one day; picks the first free person when staffId is "any". */
export function freeSlots(opts: {
  date: string;
  tz: string;
  hours: Hours[];
  step: number;
  durationMin: number;
  staffIds: string[];
  busy: Busy[];
  now?: Date;
  closures?: Closures;
  /** Plätze, von denen zur Startzeit mindestens einer frei sein muss; leer/fehlend = keine Platzprüfung */
  resources?: { ids: string[]; busy: ResourceBusy[] };
}) {
  const intervals = dayHours(opts.hours, opts.date, opts.closures);
  const earliest = (opts.now ?? new Date()).getTime() + 15 * 60_000;
  const busy = opts.busy.map((b) => ({ staff: b.staff_id, s: +new Date(b.starts_at), e: +new Date(b.ends_at) }));
  const rBusy = (opts.resources?.busy ?? []).map((b) => ({ id: b.resource_id, s: +new Date(b.starts_at), e: +new Date(b.ends_at) }));
  const rIds = opts.resources?.ids ?? [];
  const out: { min: number; start: Date; staffId: string }[] = [];
  for (const h of intervals) {
    for (let t = toMin(h.opens); t + opts.durationMin <= toMin(h.closes); t += opts.step) {
      const start = atLocal(opts.date, t, opts.tz);
      const s = start.getTime();
      if (s < earliest) continue;
      const e = s + opts.durationMin * 60_000;
      const staffId = opts.staffIds.find((id) => !busy.some((b) => b.staff === id && s < b.e && b.s < e));
      if (!staffId) continue;
      // ein Platz (z. B. Hebebühne) muss für die ganze Dauer frei sein
      if (rIds.length && !rIds.some((id) => !rBusy.some((b) => b.id === id && s < b.e && b.s < e))) continue;
      out.push({ min: t, start, staffId });
    }
  }
  return out;
}

/** Parses a Postgres tstzrange string like ["2026-10-23 08:00:00+00","2026-10-23 09:00:00+00"). */
export function parseRange(r: string): [Date, Date] {
  const m = r.match(/^[[(]"?([^",]+)"?,"?([^")\]]+)"?[)\]]$/);
  const fix = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return m ? [fix(m[1]), fix(m[2])] : [new Date(NaN), new Date(NaN)];
}
