"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { RESOURCE_KIND_LABEL, useSalon, type ResourceKind } from "../salon-context";

type Row = { id: string; name: string; kind: ResourceKind };

/** Plätze (Hebebühne, Wuchtmaschine …): ein Termin belegt je benötigter Art einen Platz, solange er dauert. */
export function ResourceSection() {
  const { salon, resources, reload } = useSalon();
  const [rows, setRows] = useState<Row[]>(() => resources.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, kind: r.kind })));
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const [planning, setPlanning] = useState(salon.planning ?? "plaetze");
  async function savePlanning(v: "plaetze" | "mitarbeiter") {
    const prev = planning;
    setPlanning(v);
    const { error } = await browserClient().from("salons").update({ planning: v }).eq("id", salon.id);
    if (error) {
      setPlanning(prev);
      return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    }
    await reload();
    setMsg({ text: "Gespeichert" });
  }

  async function save() {
    if (rows.some((r) => r.name.trim().length < 1 || r.name.trim().length > 60)) return setMsg({ text: "Bitte jedem Platz einen Namen geben.", err: true });
    setBusy(true);
    const sb = browserClient();
    const keep = new Set(rows.map((r) => r.id));
    // entfernte Plätze bleiben in alten Terminen erhalten, werden nur deaktiviert
    const removed = resources.filter((r) => r.active && !keep.has(r.id)).map((r) => r.id);
    const [a, b] = await Promise.all([
      rows.length
        ? sb.from("resources").upsert(rows.map((r, i) => ({ id: r.id, salon_id: salon.id, name: r.name.trim(), kind: r.kind, active: true, sort: i })))
        : Promise.resolve({ error: null }),
      removed.length ? sb.from("resources").update({ active: false }).in("id", removed) : Promise.resolve({ error: null }),
    ]);
    setBusy(false);
    if (a.error || b.error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    await reload();
    setMsg({ text: "Gespeichert" });
  }

  return (
    <section className="card grid content-start gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-[15px] font-semibold">Plätze</h2>
          <p className="text-sm text-muted">
            Hebebühnen und Maschinen, die ein Termin belegt. Bei Leistungen wählst du, welche Plätze sie brauchen (auch mehrere). Gibt es keinen Platz dieser Art, wird nichts geprüft.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => setRows([...rows, { id: crypto.randomUUID(), name: "", kind: "buehne" }])}><Plus size={16} /> Platz</button>
      </div>
      <div className="grid gap-1.5">
        <span className="text-[13px] text-muted">Freie Zeiten planen nach</span>
        <div className="flex w-fit rounded-xl border border-line bg-card p-1" role="radiogroup" aria-label="Planung nach">
          {([["plaetze", "Plätzen"], ["mitarbeiter", "Mitarbeitern"]] as const).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={planning === v} onClick={() => planning !== v && savePlanning(v)}
              className="rounded-lg px-3 py-1.5 text-sm text-muted aria-checked:bg-accent aria-checked:text-accent-ink">
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-dim">
          {planning === "plaetze"
            ? "Eine Zeit ist frei, wenn die nötigen Plätze frei sind. Mitarbeiter dürfen mehrere Termine gleichzeitig haben."
            : "Eine Zeit ist frei, wenn die Plätze frei sind und ein Mitarbeiter Zeit hat."}
        </p>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted">Noch keine Plätze. Ohne Plätze wird nur die Auslastung der Mitarbeiter geplant.</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="grid max-w-lg grid-cols-[minmax(0,1fr)_150px_40px] gap-2">
          <input aria-label="Name des Platzes" className="input input-sm" value={r.name} placeholder="z. B. Hebebühne 1"
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <select aria-label="Art" className="input input-sm" value={r.kind} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as ResourceKind } : x)))}>
            {(Object.keys(RESOURCE_KIND_LABEL) as ResourceKind[]).map((k) => <option key={k} value={k}>{RESOURCE_KIND_LABEL[k]}</option>)}
          </select>
          <button className="icon-btn" aria-label="Platz entfernen" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
        </div>
      ))}
      <p className="text-xs text-dim">Entfernte Plätze bleiben in alten Terminen sichtbar.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy} onClick={save}>{busy ? "Speichert …" : "Plätze speichern"}</button>
        {msg && <span className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
