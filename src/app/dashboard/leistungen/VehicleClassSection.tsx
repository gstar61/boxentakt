"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase";
import { useSalon } from "../salon-context";

const CLASSES = [
  ["pkw", "Pkw"],
  ["suv", "SUV / Geländewagen"],
  ["transporter", "Transporter / Bus"],
] as const;

const toEuro = (cents: number) => (cents / 100).toString().replace(".", ",");

/** Zuschlag je Fahrzeugklasse: zusätzliche Zeit (Minuten) und Aufpreis (Euro) pro Termin. */
export function VehicleClassSection() {
  const { salon, reload } = useSalon();
  const [vals, setVals] = useState(() =>
    Object.fromEntries(CLASSES.map(([k]) => [k, { min: String(salon.class_extra?.[k]?.min ?? 0), eur: toEuro(salon.class_extra?.[k]?.cents ?? 0) }])),
  );
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const out: Record<string, { min: number; cents: number }> = {};
    for (const [k, label] of CLASSES) {
      const min = Math.round(Number(vals[k].min.replace(",", ".")));
      const cents = Math.round(Number(vals[k].eur.replace(",", ".")) * 100);
      if (!Number.isFinite(min) || min < 0 || min > 240 || !Number.isFinite(cents) || cents < 0 || cents > 100000)
        return setMsg({ text: `Zuschlag für „${label}“ ist ungültig (0–240 Min., 0–1000 €).`, err: true });
      out[k] = { min, cents };
    }
    setBusy(true);
    const { error } = await browserClient().from("salons").update({ class_extra: out }).eq("id", salon.id);
    setBusy(false);
    if (error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    await reload();
    setMsg({ text: "Gespeichert" });
  }

  return (
    <section className="card grid gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-[15px] font-semibold">Fahrzeugklassen</h2>
        <p className="text-sm text-muted">
          Kunden wählen bei der Buchung Pkw, SUV oder Transporter. Der Zuschlag wird einmal pro Termin auf Dauer und Preis gerechnet, der Kalender plant die Zeit ein.
        </p>
      </div>
      <div className="grid gap-3">
        {CLASSES.map(([k, label]) => (
          <div key={k} className="grid grid-cols-[1fr_88px_96px] items-center gap-3 text-sm">
            <span>{label}</span>
            <label className="grid gap-1 text-xs text-muted">
              Minuten
              <input inputMode="numeric" className="input input-sm tabular-nums" value={vals[k].min} onChange={(e) => setVals({ ...vals, [k]: { ...vals[k], min: e.target.value } })} />
            </label>
            <label className="grid gap-1 text-xs text-muted">
              Aufpreis in €
              <input inputMode="decimal" className="input input-sm tabular-nums" value={vals[k].eur} onChange={(e) => setVals({ ...vals, [k]: { ...vals[k], eur: e.target.value } })} />
            </label>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy} onClick={save}>{busy ? "Speichert …" : "Speichern"}</button>
        {msg && <span className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
