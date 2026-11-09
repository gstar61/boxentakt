"use client";

import { useState } from "react";
import { Ban, Trash2 } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { addDays, atLocal, hm, zonedDate, zonedMinutes } from "@/lib/time";
import { Drawer, Select, TextField } from "../ui";
import type { Absence } from "./data";

const TIMES = Array.from({ length: 33 }, (_, i) => 360 + i * 30);

export function AbsenceDialog(props: {
  salonId: string;
  tz: string;
  date: string;
  staff: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [who, setWho] = useState("salon");
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState(props.date);
  const [to, setTo] = useState(props.date);
  const [time, setTime] = useState<[number, number]>([540, 780]);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const start = allDay ? atLocal(from, 0, props.tz) : atLocal(from, time[0], props.tz);
    const end = allDay ? atLocal(addDays(to, 1), 0, props.tz) : atLocal(from, time[1], props.tz);
    if (end <= start) return setErr("Das Ende muss nach dem Beginn liegen.");
    setBusy(true);
    const sb = browserClient();
    const staffId = who === "salon" ? null : who;
    const { error } = await sb.from("absences").insert({
      salon_id: props.salonId,
      staff_id: staffId,
      during: `[${start.toISOString()},${end.toISOString()})`,
      reason: reason.trim() || null,
    });
    if (error) {
      setBusy(false);
      return setErr("Speichern fehlgeschlagen.");
    }
    let q = sb
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("salon_id", props.salonId)
      .neq("status", "storniert")
      .filter("during", "ov", `[${start.toISOString()},${end.toISOString()})`);
    if (staffId) q = q.eq("staff_id", staffId);
    const { count } = await q;
    setBusy(false);
    props.onSaved(count ? `Abwesenheit gespeichert – ${count} Termin(e) liegen darin, bitte verschieben oder absagen` : "Abwesenheit gespeichert");
  }

  return (
    <Drawer onClose={props.onClose} title="Abwesenheit eintragen" eyebrow="Urlaub, Krankheit, Fortbildung">
      <form onSubmit={save} className="grid gap-3.5" noValidate>
        <Select id="ab-who" label="Wer" value={who} onChange={setWho} options={[["salon", "Ganzer Salon"], ...props.staff.map((s) => [s.id, s.name] as [string, string])]} />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-accent" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Ganztägig
        </label>
        {allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <TextField id="ab-from" label="Von" type="date" value={from} onChange={(v) => { if (v) { setFrom(v); if (v > to) setTo(v); } }} />
            <TextField id="ab-to" label="Bis einschließlich" type="date" value={to} onChange={(v) => v && setTo(v)} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <TextField id="ab-day" label="Datum" type="date" value={from} onChange={(v) => v && setFrom(v)} />
            <Select id="ab-t1" label="Von" value={String(time[0])} onChange={(v) => setTime([Number(v), time[1]])} options={TIMES.map((t) => [String(t), hm(t)])} />
            <Select id="ab-t2" label="Bis" value={String(time[1])} onChange={(v) => setTime([time[0], Number(v)])} options={TIMES.map((t) => [String(t), hm(t)])} />
          </div>
        )}
        <TextField id="ab-reason" label="Grund (optional, nur intern)" value={reason} onChange={setReason} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <p className="text-xs text-dim">In diesem Zeitraum sind keine Online-Buchungen möglich.</p>
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy}><Ban size={18} /> {busy ? "Speichert …" : "Eintragen"}</button>
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>Abbrechen</button>
        </div>
      </form>
    </Drawer>
  );
}

export function AbsenceDrawer(props: { absence: Absence; tz: string; staffName: string; onClose: () => void; onDeleted: () => void }) {
  const ab = props.absence;
  const [busy, setBusy] = useState(false);
  const fmt = (d: Date) => `${zonedDate(d, props.tz).split("-").reverse().join(".")} ${hm(zonedMinutes(d, props.tz))}`;
  async function remove() {
    setBusy(true);
    await browserClient().from("absences").delete().eq("id", ab.id);
    setBusy(false);
    props.onDeleted();
  }
  return (
    <Drawer onClose={props.onClose} title={ab.reason || "Abwesend"} eyebrow={props.staffName}>
      <p className="text-sm text-muted">{fmt(ab.start)} bis {fmt(ab.end)}</p>
      <div>
        <button className="btn btn-danger" disabled={busy} onClick={remove}><Trash2 size={16} /> Abwesenheit löschen</button>
      </div>
    </Drawer>
  );
}
