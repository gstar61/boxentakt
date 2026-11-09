"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileDown, Search, Trash2, UserRound } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { euro, fullDateTime, parseRange } from "@/lib/time";
import { useSalon } from "../salon-context";
import { Drawer, TextField } from "../ui";
import { exportCustomerData } from "@/lib/data-export";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  created_at: string;
};
type Stats = {
  customer_id: string;
  bookings: number;
  visits: number;
  no_shows: number;
  cancellations: number;
  last_visit: string | null;
  next_visit: string | null;
  revenue_cents: number;
};
type History = { id: string; service_name: string; price_cents: number; status: string; start: Date };

const STATUS: Record<string, { label: string; cls: string }> = {
  gebucht: { label: "Gebucht", cls: "text-accent" },
  erschienen: { label: "Erschienen", cls: "text-muted" },
  nicht_erschienen: { label: "Nicht erschienen", cls: "text-danger" },
  storniert: { label: "Storniert", cls: "text-dim line-through" },
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const digits = (s: string) => s.replace(/\D/g, "").replace(/^(00)?49/, "0");
const shortDate = (iso: string | null, tz: string) =>
  iso ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: tz }).format(new Date(iso)) : "–";

/** CSV with semicolons and BOM so Excel (German locale) opens it directly. */
function downloadCsv(rows: (Customer & { stats?: Stats })[], salonSlug: string) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Telefon", "E-Mail", "Notiz", "Besuche", "Nicht erschienen", "Abgesagt", "Zuletzt", "Nächster Termin", "Umsatz (€)", "Kunde seit"];
  const lines = rows.map((r) =>
    [
      r.name, r.phone, r.email, r.note, r.stats?.visits ?? 0, r.stats?.no_shows ?? 0, r.stats?.cancellations ?? 0,
      r.stats?.last_visit?.slice(0, 10), r.stats?.next_visit?.slice(0, 10),
      ((r.stats?.revenue_cents ?? 0) / 100).toFixed(2).replace(".", ","), r.created_at.slice(0, 10),
    ].map(cell).join(";"),
  );
  const blob = new Blob(["\uFEFF" + [head.map(cell).join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kunden-${salonSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function CustomersPage() {
  const { salon } = useSalon();
  const tz = salon.timezone;
  const [rows, setRows] = useState<(Customer & { stats?: Stats })[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const [c, st] = await Promise.all([
      sb.from("customers").select("id,name,phone,email,note,created_at").eq("salon_id", salon.id).order("name").limit(2000),
      sb.from("customer_stats").select("*").eq("salon_id", salon.id).limit(2000),
    ]);
    const stats = new Map(((st.data ?? []) as Stats[]).map((x) => [x.customer_id, x]));
    setRows(((c.data ?? []) as Customer[]).map((x) => ({ ...x, stats: stats.get(x.id) })));
  }, [salon.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the request resolves
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!rows || !term) return rows ?? [];
    const d = digits(term);
    return rows.filter((r) => r.name.toLowerCase().includes(term) || (d.length >= 3 && digits(r.phone ?? "").includes(d)) || r.email?.toLowerCase().includes(term));
  }, [rows, q]);

  const selected = rows?.find((r) => r.id === sel) ?? null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <span className="label">{rows ? `${rows.length} Kunden` : "Kunden"}</span>
          <h1 className="text-3xl font-semibold sm:text-4xl">Kundenkartei</h1>
        </div>
        <div className="flex w-full max-w-md items-center gap-2">
          <label className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
            <input className="input input-sm !pl-10" placeholder="Name, Telefon oder E-Mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Kunden suchen" />
          </label>
          <button className="icon-btn !size-[42px]" disabled={!rows?.length} onClick={() => rows && downloadCsv(rows, salon.slug)} title="Als CSV exportieren (Excel)" aria-label="Kundenkartei als CSV exportieren">
            <Download size={16} />
          </button>
        </div>
      </div>

      {rows === null ? (
        <p className="text-muted">Lädt …</p>
      ) : filtered.length === 0 ? (
        <p className="empty"><UserRound size={18} /> {rows.length ? "Keine Treffer." : "Noch keine Kunden. Sie entstehen automatisch mit der ersten Buchung."}</p>
      ) : (
        <>
        {/* phones: one card per customer instead of a sideways-scrolling table */}
        <ul className="grid gap-2 sm:hidden">
          {filtered.map((r) => (
            <li key={r.id}>
              <button onClick={() => setSel(r.id)} className="card grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 p-3.5 text-left hover:bg-fg/3">
                <span className="row-span-2 grid size-9 place-items-center rounded-full bg-fg/7 text-xs font-semibold text-muted">{initials(r.name)}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  {(r.stats?.visits ?? 0) >= 3 && <span className="shrink-0 text-xs text-accent">Stammkunde</span>}
                  {r.note && <span title={r.note} className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="Hat eine Notiz" />}
                </span>
                <span className="text-right text-sm font-medium tabular-nums">{euro(r.stats?.revenue_cents ?? 0)}</span>
                <span className="col-span-2 flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
                  <span>{r.stats?.visits ?? 0} Besuche</span>
                  {r.stats?.no_shows ? <span className="text-danger">{r.stats.no_shows} nicht erschienen</span> : null}
                  <span>{r.stats?.next_visit ? `Nächster ${shortDate(r.stats.next_visit, tz)}` : `Zuletzt ${shortDate(r.stats?.last_visit ?? null, tz)}`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="card hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Telefon</th>
                <th className="px-4 py-3 text-right font-medium">Besuche</th>
                <th className="px-4 py-3 text-right font-medium">Nicht erschienen</th>
                <th className="px-4 py-3 font-medium">Zuletzt</th>
                <th className="px-4 py-3 font-medium">Nächster Termin</th>
                <th className="px-4 py-3 text-right font-medium">Umsatz</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => setSel(r.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-fg/3">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fg/7 text-xs font-semibold text-muted">{initials(r.name)}</span>
                      <span className="grid">
                        <span className="whitespace-nowrap font-medium">{r.name}</span>
                        {(r.stats?.visits ?? 0) >= 3 && <span className="text-xs text-accent">Stammkunde</span>}
                      </span>
                      {r.note && <span title={r.note} className="size-1.5 rounded-full bg-accent" aria-label="Hat eine Notiz" />}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-muted">{r.phone ?? "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.stats?.visits ?? 0}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.stats?.no_shows ? "text-danger" : "text-muted"}`}>{r.stats?.no_shows ?? 0}</td>
                  <td className="px-4 py-3 font-mono text-muted">{shortDate(r.stats?.last_visit ?? null, tz)}</td>
                  <td className="px-4 py-3 font-mono">{shortDate(r.stats?.next_visit ?? null, tz)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{euro(r.stats?.revenue_cents ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {selected && <CustomerDrawer key={selected.id} customer={selected} stats={selected.stats} tz={tz} onClose={() => setSel(null)} onChanged={load} />}
    </div>
  );
}

function CustomerDrawer(props: { customer: Customer; stats?: Stats; tz: string; onClose: () => void; onChanged: () => void }) {
  const c = props.customer;
  const { salon } = useSalon();
  const [form, setForm] = useState({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", note: c.note ?? "" });
  const [history, setHistory] = useState<History[] | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    browserClient()
      .from("appointments")
      .select("id,service_name,price_cents,status,during")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }: { data: unknown }) => {
        const list = ((data ?? []) as (Omit<History, "start"> & { during: string })[]).map((h) => ({ ...h, start: parseRange(h.during)[0] }));
        setHistory(list.sort((a, b) => b.start.getTime() - a.start.getTime()));
      });
  }, [c.id]);

  async function save() {
    if (form.name.trim().length < 2) return setMsg({ text: "Bitte einen Namen eintragen.", err: true });
    const { error } = await browserClient()
      .from("customers")
      .update({ name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, note: form.note.trim() || null })
      .eq("id", c.id);
    if (error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    setMsg({ text: "Gespeichert" });
    props.onChanged();
  }

  async function remove() {
    const { error } = await browserClient().from("customers").delete().eq("id", c.id);
    if (error) return setMsg({ text: "Löschen fehlgeschlagen.", err: true });
    props.onChanged();
    props.onClose();
  }

  const s = props.stats;
  return (
    <Drawer onClose={props.onClose} title={c.name} eyebrow={`Kunde seit ${new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(c.created_at))}`}>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Besuche", String(s?.visits ?? 0)],
          ["Nicht erschienen", String(s?.no_shows ?? 0)],
          ["Umsatz", euro(s?.revenue_cents ?? 0)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-card-2 px-2 py-3">
            <div className={`text-lg font-semibold tabular-nums ${k === "Nicht erschienen" && s?.no_shows ? "text-danger" : ""}`}>{v}</div>
            <div className="text-[11px] text-muted">{k}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        <TextField id="cu-name" label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <TextField id="cu-phone" label="Telefon" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <TextField id="cu-mail" label="E-Mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <div className="grid gap-1.5">
          <label htmlFor="cu-note" className="text-[13px] text-muted">Notiz (nur für den Salon, z. B. Farbrezeptur)</label>
          <textarea id="cu-note" className="input text-sm" maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        {msg && <p role="status" className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={save}>Speichern</button>
          {confirmDelete ? (
            <>
              <button className="btn btn-danger" onClick={remove}><Trash2 size={16} /> Endgültig löschen</button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Abbrechen</button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Löschen</button>
          )}
          <button
            className="btn btn-ghost"
            title="Alle gespeicherten Daten dieses Kunden als Datei (Auskunft nach Art. 15 DSGVO)"
            onClick={() =>
              exportCustomerData(salon, c).catch((e) => {
                console.error(e);
                setMsg({ text: "Auskunft fehlgeschlagen.", err: true });
              })
            }
          >
            <FileDown size={16} /> Auskunft
          </button>
        </div>
        {confirmDelete && <p className="text-xs text-muted">Löscht den Kunden mit allen Terminen (z. B. auf Wunsch nach DSGVO).</p>}
      </div>

      <div className="grid gap-2">
        <span className="label">Termine</span>
        {history === null ? (
          <p className="text-sm text-muted">Lädt …</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted">Keine Termine.</p>
        ) : (
          <ul className="grid gap-1.5">
            {history.map((h) => (
              <li key={h.id} className="grid grid-cols-[1fr_auto] gap-x-3 rounded-xl border border-line bg-card-2 px-3 py-2.5 text-sm">
                <span className="truncate">{h.service_name}</span>
                <span className="tabular-nums text-muted">{euro(h.price_cents)}</span>
                <span className="text-xs text-muted">{fullDateTime(h.start, props.tz)}</span>
                <span className={`text-right text-xs ${STATUS[h.status]?.cls ?? ""}`}>{STATUS[h.status]?.label ?? h.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
