"use client";

import { useState } from "react";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { addDays, groupDays, hm, shortDay, zonedDate } from "@/lib/time";
import { useSalon } from "../salon-context";

const STATES = [
  ["BW", "Baden-Württemberg"], ["BY", "Bayern"], ["BE", "Berlin"], ["BB", "Brandenburg"], ["HB", "Bremen"], ["HH", "Hamburg"],
  ["HE", "Hessen"], ["MV", "Mecklenburg-Vorpommern"], ["NI", "Niedersachsen"], ["NW", "Nordrhein-Westfalen"], ["RP", "Rheinland-Pfalz"],
  ["SL", "Saarland"], ["SN", "Sachsen"], ["ST", "Sachsen-Anhalt"], ["SH", "Schleswig-Holstein"], ["TH", "Thüringen"],
] as const;
const TIMES = Array.from({ length: 33 }, (_, i) => 360 + i * 30);
const fmt = (d: string) => `${shortDay(d)}, ${Number(d.slice(8))}.${Number(d.slice(5, 7))}.`;

/** Public holidays per federal state (closed online) and special days: holidays off, other hours on single days. */
export function ClosuresSection() {
  const { salon, closures, reload } = useSalon();
  const today = zonedDate(new Date(), salon.timezone);
  const [state, setState] = useState(salon.holiday_state ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<"closed" | "hours">("closed");
  const [opens, setOpens] = useState(540);
  const [closes, setCloses] = useState(780);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const upcoming = closures.special_days.filter((d) => d.day >= today);
  const holidays = closures.holidays.filter((h) => h.day >= today && !upcoming.some((d) => d.day === h.day)).slice(0, 6);

  async function saveState(v: string) {
    setState(v);
    const { error } = await browserClient().from("salons").update({ holiday_state: v || null }).eq("id", salon.id);
    if (error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    await reload();
    setMsg({ text: v ? "Feiertage übernommen. An diesen Tagen ist online geschlossen." : "Feiertage ausgeschaltet." });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const end = to || from;
    if (!from || end < from) return setMsg({ text: "Bitte einen gültigen Zeitraum wählen.", err: true });
    if (kind === "hours" && opens >= closes) return setMsg({ text: "„bis“ muss nach „von“ liegen.", err: true });
    const days: string[] = [];
    for (let d = from; d <= end && days.length <= 62; d = addDays(d, 1)) days.push(d);
    if (days.length > 62) return setMsg({ text: "Höchstens zwei Monate am Stück.", err: true });
    setBusy(true);
    const { error } = await browserClient().from("special_days").upsert(
      days.map((day) => ({ salon_id: salon.id, day, opens: kind === "hours" ? hm(opens) : null, closes: kind === "hours" ? hm(closes) : null, note: note.trim() || null })),
    );
    setBusy(false);
    if (error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    setFrom(""); setTo(""); setNote("");
    await reload();
    setMsg({ text: kind === "closed" ? "Eingetragen. In diesem Zeitraum ist online geschlossen." : "Sonderöffnungszeit eingetragen." });
  }

  async function remove(r: { from: string; to: string }) {
    const { error } = await browserClient().from("special_days").delete().eq("salon_id", salon.id).gte("day", r.from).lte("day", r.to);
    if (error) return setMsg({ text: "Löschen fehlgeschlagen.", err: true });
    await reload();
  }

  return (
    <section className="card grid gap-5 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><CalendarOff size={16} /> Feiertage &amp; Urlaub</h2>
        <p className="text-sm text-muted">An Feiertagen und eingetragenen Tagen nimmt die Buchungsseite keine Termine an. Im Kalender kannst du trotzdem selbst eintragen.</p>
      </div>

      <div className="grid max-w-3xl gap-2">
        <label htmlFor="hol-state" className="text-[13px] text-muted">Gesetzliche Feiertage</label>
        <select id="hol-state" className="input input-sm w-full sm:w-80" value={state} onChange={(e) => saveState(e.target.value)}>
          <option value="">Keine Feiertage berücksichtigen</option>
          {STATES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        {state && holidays.length > 0 && (
          <p className="text-xs text-dim">Nächste: {holidays.map((h) => `${fmt(h.day)} ${h.name}`).join(" · ")}</p>
        )}
      </div>

      <form onSubmit={add} className="grid max-w-3xl gap-3 rounded-xl border border-line p-4">
        <span className="text-[13px] font-medium">Urlaub oder Sondertag eintragen</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="pill" aria-pressed={kind === "closed"} onClick={() => setKind("closed")}>Geschlossen</button>
          <button type="button" className="pill" aria-pressed={kind === "hours"} onClick={() => setKind("hours")}>Andere Öffnungszeit</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[13px] text-muted">Von<input type="date" className="input input-sm" min={today} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="grid gap-1.5 text-[13px] text-muted">Bis (optional)<input type="date" className="input input-sm" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {kind === "hours" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[13px] text-muted">Geöffnet von
              <select className="input input-sm" value={opens} onChange={(e) => setOpens(Number(e.target.value))}>{TIMES.map((t) => <option key={t} value={t}>{hm(t)}</option>)}</select>
            </label>
            <label className="grid gap-1.5 text-[13px] text-muted">bis
              <select className="input input-sm" value={closes} onChange={(e) => setCloses(Number(e.target.value))}>{TIMES.map((t) => <option key={t} value={t}>{hm(t)}</option>)}</select>
            </label>
          </div>
        )}
        <label className="grid gap-1.5 text-[13px] text-muted">Hinweis für Kunden (optional)
          <input className="input input-sm" maxLength={100} placeholder={kind === "closed" ? "z. B. Betriebsurlaub" : "z. B. Heiligabend"} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn btn-sm w-fit" disabled={busy}><Plus size={15} /> {busy ? "Speichert …" : "Eintragen"}</button>
      </form>

      {upcoming.length > 0 && (
        <div className="grid max-w-3xl gap-1.5">
          <span className="label">Eingetragen</span>
          {groupDays(upcoming).map((r) => (
            <div key={r.from} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{r.from === r.to ? fmt(r.from) : `${fmt(r.from)} – ${fmt(r.to)}`}</span>
                <span className="text-muted"> · {r.opens ? `${r.opens}–${r.closes}` : "geschlossen"}{r.note ? ` · ${r.note}` : ""}</span>
              </span>
              <button className="icon-btn shrink-0" aria-label="Eintrag löschen" onClick={() => remove(r)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {msg && <p className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
    </section>
  );
}
