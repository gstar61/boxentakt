"use client";

import { useEffect, useState } from "react";
import { Ban, Trash2 } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { de } from "date-fns/locale";
import { browserClient } from "@/lib/supabase";
import { atLocal, hm, parseRange, zonedDate } from "@/lib/time";
import { Select, TextField } from "../ui";
import { useSalon } from "../salon-context";

type BlockRow = { id: string; resource_id: string; during: string | null; weekday: number | null; starts: string | null; ends: string | null; reason: string | null };

const DAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const TIMES = Array.from({ length: 33 }, (_, i) => 360 + i * 30).map((m) => [String(m), hm(m)] as [string, string]);

/** Sperrzeiten je Platz (Wartung, Defekt …): einmalig von–bis oder jede Woche. Gesperrte Plätze vergibt das System nicht. */
export function BlockSection() {
  const { salon, resources } = useSalon();
  const tz = salon.timezone;
  const places = resources.filter((r) => r.active);
  const today = zonedDate(new Date(), tz);
  const [rows, setRows] = useState<BlockRow[] | null>(null);
  const [form, setForm] = useState({ place: places[0]?.id ?? "", repeat: false, from: today, fromMin: "480", to: today, toMin: "720", weekday: "1", reason: "" });
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    browserClient()
      .from("resource_blocks")
      .select("id,resource_id,during,weekday,starts,ends,reason")
      .eq("salon_id", salon.id)
      .order("created_at")
      .then(({ data }: { data: BlockRow[] | null }) => live && setRows(data ?? []));
    return () => {
      live = false;
    };
  }, [salon.id, tick]);

  // abgelaufene einmalige Sperren nicht mehr zeigen
  const shown = (rows ?? []).filter((r) => !r.during || parseRange(r.during)[1].getTime() > now);
  const label = (r: BlockRow) => {
    if (r.weekday != null && r.starts && r.ends) return `jeden ${DAYS[r.weekday]} ${r.starts.slice(0, 5)}–${r.ends.slice(0, 5)}`;
    const [s, e] = parseRange(r.during ?? "");
    const f = (d: Date) => formatInTimeZone(d, tz, "EEEEEE d.M. HH:mm", { locale: de });
    return zonedDate(s, tz) === zonedDate(e, tz) ? `${f(s)}–${formatInTimeZone(e, tz, "HH:mm")}` : `${f(s)} – ${f(e)}`;
  };

  async function add() {
    if (!form.place) return setMsg({ text: "Bitte zuerst einen Platz anlegen.", err: true });
    const base = { salon_id: salon.id, resource_id: form.place, reason: form.reason.trim().slice(0, 100) || null };
    let row: Record<string, unknown>;
    if (form.repeat) {
      if (Number(form.toMin) <= Number(form.fromMin)) return setMsg({ text: "Das Ende muss nach dem Beginn liegen.", err: true });
      row = { ...base, weekday: Number(form.weekday), starts: hm(Number(form.fromMin)), ends: hm(Number(form.toMin)) };
    } else {
      const s = atLocal(form.from, Number(form.fromMin), tz);
      const e = atLocal(form.to, Number(form.toMin), tz);
      if (e <= s) return setMsg({ text: "Das Ende muss nach dem Beginn liegen.", err: true });
      row = { ...base, during: `[${s.toISOString()},${e.toISOString()})` };
    }
    setBusy(true);
    const { error } = await browserClient().from("resource_blocks").insert(row);
    setBusy(false);
    if (error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    setForm({ ...form, reason: "" });
    setMsg({ text: "Sperre eingetragen. Schon gebuchte Termine bleiben bestehen." });
    setTick((t) => t + 1);
  }

  async function remove(id: string) {
    const { error } = await browserClient().from("resource_blocks").delete().eq("id", id);
    if (error) return setMsg({ text: "Löschen fehlgeschlagen.", err: true });
    setTick((t) => t + 1);
  }

  if (!places.length) return null;
  const placeName = (id: string) => resources.find((r) => r.id === id)?.name ?? "Platz";

  return (
    <section className="card grid content-start gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-[15px] font-semibold">Sperrzeiten</h2>
        <p className="text-sm text-muted">Wartung oder Defekt: In dieser Zeit wird der Platz nicht vergeben. Einmalig oder jede Woche.</p>
      </div>

      {shown.length > 0 && (
        <ul className="grid gap-2">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
              <Ban size={16} className="text-muted" />
              <span className="font-medium">{placeName(r.resource_id)}</span>
              <span className="text-muted">{label(r)}</span>
              {r.reason && <span className="truncate text-dim">· {r.reason}</span>}
              <button className="icon-btn ml-auto" aria-label="Sperre löschen" onClick={() => remove(r.id)}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid max-w-xl gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Select id="b-place" label="Platz" value={form.place} onChange={(v) => setForm({ ...form, place: v })} options={places.map((p) => [p.id, p.name])} />
          <Select id="b-repeat" label="Wie oft" value={form.repeat ? "1" : "0"} onChange={(v) => setForm({ ...form, repeat: v === "1" })} options={[["0", "Einmalig"], ["1", "Jede Woche"]]} />
        </div>
        {form.repeat ? (
          <div className="grid grid-cols-3 gap-3">
            <Select id="b-day" label="Wochentag" value={form.weekday} onChange={(v) => setForm({ ...form, weekday: v })} options={[1, 2, 3, 4, 5, 6, 0].map((d) => [String(d), DAYS[d]])} />
            <Select id="b-from" label="Von" value={form.fromMin} onChange={(v) => setForm({ ...form, fromMin: v })} options={TIMES} />
            <Select id="b-to" label="Bis" value={form.toMin} onChange={(v) => setForm({ ...form, toMin: v })} options={TIMES} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <TextField id="b-fd" label="Von (Datum)" type="date" value={form.from} onChange={(v) => v && setForm({ ...form, from: v, to: form.to < v ? v : form.to })} />
            <Select id="b-fm" label="Von (Uhrzeit)" value={form.fromMin} onChange={(v) => setForm({ ...form, fromMin: v })} options={TIMES} />
            <TextField id="b-td" label="Bis (Datum)" type="date" value={form.to} onChange={(v) => v && setForm({ ...form, to: v })} />
            <Select id="b-tm" label="Bis (Uhrzeit)" value={form.toMin} onChange={(v) => setForm({ ...form, toMin: v })} options={TIMES} />
          </div>
        )}
        <TextField id="b-reason" label="Grund (optional)" value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy} onClick={add}>{busy ? "Speichert …" : "Sperre eintragen"}</button>
        {msg && <span className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
