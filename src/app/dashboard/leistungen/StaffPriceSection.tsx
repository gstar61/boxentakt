"use client";

import { useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { euro } from "@/lib/time";
import { useSalon } from "../salon-context";

const toInput = (cents: number) => (cents / 100).toString().replace(".", ",");

/** Differing prices per person and service, e.g. the master stylist charges more. Empty field = normal price. */
export function StaffPriceSection() {
  const { salon, services, staff, staffPrices, reload } = useSalon();
  const activeServices = services.filter((s) => s.active);
  const activeStaff = staff.filter((s) => s.active);
  const initial = useMemo(
    () => Object.fromEntries(staffPrices.map((p) => [`${p.staff_id}|${p.service_id}`, toInput(p.price_cents)])) as Record<string, string>,
    [staffPrices],
  );
  const [vals, setVals] = useState(initial);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(staffPrices.length > 0);

  if (activeStaff.length < 2 || !activeServices.length) return null;

  async function save() {
    const rows: { staff_id: string; service_id: string; salon_id: string; price_cents: number }[] = [];
    const clear: { staff_id: string; service_id: string }[] = [];
    for (const sv of activeServices) {
      for (const st of activeStaff) {
        const raw = (vals[`${st.id}|${sv.id}`] ?? "").trim();
        const cents = raw ? Math.round(Number(raw.replace(",", ".")) * 100) : null;
        if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return setMsg({ text: `Preis für ${st.name} bei „${sv.name}“ ist ungültig.`, err: true });
        // same as the normal price or empty: no extra row needed
        if (cents === null || cents === sv.price_cents) clear.push({ staff_id: st.id, service_id: sv.id });
        else rows.push({ staff_id: st.id, service_id: sv.id, salon_id: salon.id, price_cents: cents });
      }
    }
    setBusy(true);
    const sb = browserClient();
    const stale = staffPrices.filter((p) => clear.some((c) => c.staff_id === p.staff_id && c.service_id === p.service_id));
    const results = await Promise.all([
      rows.length ? sb.from("staff_prices").upsert(rows) : Promise.resolve({ error: null }),
      ...stale.map((p) => sb.from("staff_prices").delete().eq("staff_id", p.staff_id).eq("service_id", p.service_id)),
    ]);
    setBusy(false);
    if (results.some((r) => r.error)) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    await reload();
    setMsg({ text: "Gespeichert" });
  }

  return (
    <section className="card grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-[15px] font-semibold">Preise je Person</h2>
          <p className="text-sm text-muted">Wenn jemand im Team für eine Leistung mehr oder weniger nimmt. Leer lassen = normaler Preis.</p>
        </div>
        {!open && <button className="btn btn-sm" onClick={() => setOpen(true)}>Preise festlegen</button>}
      </div>

      {open && (
        <>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[420px] border-separate border-spacing-y-1.5 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pr-3 font-normal">Leistung</th>
                  {activeStaff.map((st) => <th key={st.id} className="px-1 font-normal">{st.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {activeServices.map((sv) => (
                  <tr key={sv.id}>
                    <td className="pr-3">
                      <div className="max-w-[220px] truncate">{sv.name}</div>
                      <div className="text-xs tabular-nums text-dim">normal {euro(sv.price_cents)}</div>
                    </td>
                    {activeStaff.map((st) => {
                      const k = `${st.id}|${sv.id}`;
                      return (
                        <td key={st.id} className="px-1">
                          <input
                            aria-label={`Preis ${sv.name} bei ${st.name}`}
                            inputMode="decimal"
                            className="input input-sm w-full min-w-[84px] tabular-nums"
                            placeholder={toInput(sv.price_cents)}
                            value={vals[k] ?? ""}
                            onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-dim">Auf der Buchungsseite steht dann der Preis der gewählten Person. Bei „Egal, wer frei ist“ wird der günstigste als „ab“-Preis gezeigt.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" disabled={busy} onClick={save}>{busy ? "Speichert …" : "Speichern"}</button>
            {msg && <span className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
