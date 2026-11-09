"use client";

import { useState } from "react";
import { BellRing, Star } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { useSalon } from "../salon-context";

const WEEKS = [0, 3, 4, 5, 6, 8, 10, 12, 16, 26];

/** Google review request the day after a visit and "time for your next appointment" reminders per service. */
export function FollowupSection() {
  const { salon, services, reload } = useSalon();
  const active = services.filter((s) => s.active);
  const [url, setUrl] = useState(salon.google_review_url ?? "");
  const [weeks, setWeeks] = useState<Record<string, number>>(() => Object.fromEntries(active.map((s) => [s.id, s.rebook_weeks ?? 0])));
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const link = url.trim();
    if (link && !/^https:\/\/\S+$/.test(link)) return setMsg({ text: "Der Bewertungslink muss mit https:// beginnen.", err: true });
    setBusy(true);
    const sb = browserClient();
    const results = await Promise.all([
      sb.from("salons").update({ google_review_url: link || null }).eq("id", salon.id),
      ...active
        .filter((s) => (s.rebook_weeks ?? 0) !== weeks[s.id])
        .map((s) => sb.from("services").update({ rebook_weeks: weeks[s.id] || null }).eq("id", s.id)),
    ]);
    setBusy(false);
    if (results.some((r) => r.error)) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    await reload();
    setMsg({ text: "Gespeichert" });
  }

  return (
    <section className="card grid gap-5 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-[15px] font-semibold">Bewertungen &amp; Wiederkommen</h2>
        <p className="text-sm text-muted">
          Automatische Mails an Kunden mit E-Mail-Adresse. Jede Mail enthält einen Abmeldelink, auf der Buchungsseite steht ein Hinweis
          darauf.
        </p>
      </div>

      <div className="grid max-w-3xl gap-2">
        <label htmlFor="review" className="flex items-center gap-2 text-[13px] text-muted"><Star size={14} /> Google-Bewertungslink</label>
        <input id="review" className="input input-sm" placeholder="https://g.page/r/…/review" value={url} onChange={(e) => setUrl(e.target.value)} />
        <p className="text-xs text-dim">
          Im Google-Unternehmensprofil unter „Bewertungen anfordern“ kopieren. Ist ein Link eingetragen, bekommt jeder Kunde am Tag nach seinem ersten
          Termin einmalig eine Bitte um Bewertung.
        </p>
      </div>

      <div className="grid gap-2">
        <span className="flex items-center gap-2 text-[13px] text-muted"><BellRing size={14} /> Erinnerung an den nächsten Termin</span>
        <div className="grid gap-1.5">
          {active.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <span className="min-w-0 truncate text-sm">{s.name}</span>
              <select
                aria-label={`Erinnerung für ${s.name}`}
                className="input input-sm !h-9 w-auto shrink-0"
                value={weeks[s.id] ?? 0}
                onChange={(e) => setWeeks({ ...weeks, [s.id]: Number(e.target.value) })}
              >
                {WEEKS.map((w) => <option key={w} value={w}>{w ? `nach ${w} Wochen` : "keine"}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p className="text-xs text-dim">Geht nur raus, wenn der Kunde noch keinen neuen Termin hat. Typisch: Räderwechsel 26 Wochen, Ölwechsel 52 Wochen.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy} onClick={save}>{busy ? "Speichert …" : "Speichern"}</button>
        {msg && <span className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
