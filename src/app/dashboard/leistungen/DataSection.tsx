"use client";

import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSalon } from "../salon-context";
import { exportSalonData } from "@/lib/data-export";

/** Data access (Art. 15/20 GDPR): full export for the salon, pointer to the per-customer export. */
export function DataSection() {
  const { salon } = useSalon();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      await exportSalonData(salon);
      setMsg({ text: "Download gestartet." });
    } catch (e) {
      console.error(e);
      setMsg({ text: "Export fehlgeschlagen. Bitte später erneut versuchen.", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card grid gap-5 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck size={16} /> Daten &amp; Datenschutz</h2>
        <p className="text-sm text-muted">
          Alles, was Trimtable zu deinem Salon und Konto speichert, als Datei (JSON): Einstellungen, Team, Kunden, Termine, Gutscheine. Für Auskünfte nach
          Art. 15 DSGVO oder einen Wechsel.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy} onClick={run}>
          <Download size={16} /> {busy ? "Wird erstellt …" : "Alle Daten herunterladen"}
        </button>
        {msg && <span role="status" className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</span>}
      </div>
      <p className="text-sm text-muted">
        Fragt eine Kundin, welche Daten du über sie speicherst? In der <Link href="/dashboard/kunden" className="text-accent underline underline-offset-2">Kundenkartei</Link> beim
        Kunden auf „Auskunft“ tippen und die Datei weitergeben. Antwort spätestens innerhalb eines Monats.
      </p>
    </section>
  );
}
