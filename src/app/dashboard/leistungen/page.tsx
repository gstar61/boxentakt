"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BellRing, Clock3, Coffee, CreditCard, Plus, Save, Scale, Store, Wrench, Trash2, X } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { duration, hm, toMin } from "@/lib/time";
import { useSalon, RESOURCE_KIND_LABEL, type ResourceKind } from "../salon-context";
import { TeamSection } from "./TeamSection";
import { BillingSection } from "./BillingSection";
import { BookingLink } from "./BookingLink";
import { MediaSection } from "./MediaSection";
import { FollowupSection } from "./FollowupSection";
import { PushSection } from "./PushSection";
import { StaffPriceSection } from "./StaffPriceSection";
import { VehicleClassSection } from "./VehicleClassSection";
import { ResourceSection } from "./ResourceSection";
import { ClosuresSection } from "./ClosuresSection";
import { DataSection } from "./DataSection";

const DAYS = [
  [1, "Montag"], [2, "Dienstag"], [3, "Mittwoch"], [4, "Donnerstag"], [5, "Freitag"], [6, "Samstag"], [0, "Sonntag"],
] as const;
const TABS = [
  { id: "salon", label: "Betrieb", icon: Store },
  { id: "leistungen", label: "Leistungen & Preise", icon: Wrench },
  { id: "team", label: "Team & Zeiten", icon: Clock3 },
  { id: "nachrichten", label: "Benachrichtigungen", icon: BellRing },
  { id: "abo", label: "Abo & Zahlungen", icon: CreditCard },
  { id: "rechtliches", label: "Rechtliches & Daten", icon: Scale },
] as const;
type Tab = (typeof TABS)[number]["id"];
// the active tab lives in the URL hash (#abo), so links from mails, banners and Stripe can open it directly
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const currentTab = (): Tab => {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : "salon";
};
const DUR = Array.from({ length: 24 }, (_, i) => (i + 1) * 15);
const TIMES = Array.from({ length: 33 }, (_, i) => 360 + i * 30);

type Draft = {
  name: string;
  address: string;
  phone: string;
  notice: string;
  legal_name: string;
  contact_email: string;
  vat_id: string;
  legal_extra: string;
  services: { id: string; name: string; duration_min: number; price: string; resource_kind: ResourceKind | "" }[];
  staff: { id: string; name: string }[];
  hours: Record<number, DayHours | null>;
};
type DayHours = { open: [number, number]; pause: [number, number] | null };

export default function SettingsPage() {
  const ctx = useSalon();
  const initial = useMemo<Draft>(() => ({
    name: ctx.salon.name,
    address: ctx.salon.address ?? "",
    phone: ctx.salon.phone ?? "",
    notice: ctx.salon.notice ?? "",
    legal_name: ctx.salon.legal_name ?? "",
    contact_email: ctx.salon.contact_email ?? "",
    vat_id: ctx.salon.vat_id ?? "",
    legal_extra: ctx.salon.legal_extra ?? "",
    services: ctx.services.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, duration_min: s.duration_min, price: (s.price_cents / 100).toString().replace(".", ","), resource_kind: s.resource_kind ?? "" })),
    staff: ctx.staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name })),
    hours: Object.fromEntries(DAYS.map(([d]) => {
      const iv = ctx.hours.filter((x) => x.weekday === d).sort((a, b) => toMin(a.opens) - toMin(b.opens));
      if (!iv.length) return [d, null];
      const day: DayHours = {
        open: [toMin(iv[0].opens), toMin(iv[iv.length - 1].closes)],
        pause: iv.length > 1 ? [toMin(iv[0].closes), toMin(iv[1].opens)] : null,
      };
      return [d, day];
    })),
  }), [ctx]);
  const [d, setD] = useState<Draft>(initial);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const upd = (patch: Partial<Draft>) => setD({ ...d, ...patch });

  async function save() {
    setMsg(null);
    const cents = d.services.map((s) => Math.round(Number(s.price.replace(",", ".")) * 100));
    if (!d.name.trim()) return setMsg({ text: "Bitte einen Salonnamen eintragen.", err: true });
    if (d.services.some((s) => !s.name.trim()) || cents.some((c) => !Number.isFinite(c) || c < 0)) return setMsg({ text: "Bitte alle Leistungen mit Name und Preis ausfüllen.", err: true });
    if (!d.staff.length || d.staff.some((s) => !s.name.trim())) return setMsg({ text: "Mindestens eine Person mit Namen eintragen.", err: true });
    if (Object.values(d.hours).some((h) => h && h.open[0] >= h.open[1])) return setMsg({ text: "Öffnungszeit: „bis“ muss nach „von“ liegen.", err: true });
    if (Object.values(d.hours).some((h) => h?.pause && !(h.open[0] < h.pause[0] && h.pause[0] < h.pause[1] && h.pause[1] < h.open[1])))
      return setMsg({ text: "Die Pause muss innerhalb der Öffnungszeit liegen.", err: true });

    setBusy(true);
    const sb = browserClient();
    const sid = ctx.salon.id;
    const keepSvc = new Set(d.services.map((s) => s.id));
    const keepStaff = new Set(d.staff.map((s) => s.id));
    const results = await Promise.all([
      sb.from("salons").update({ name: d.name.trim(), address: d.address.trim() || null, phone: d.phone.trim() || null, notice: d.notice.trim() || null, legal_name: d.legal_name.trim() || null, contact_email: d.contact_email.trim() || null, vat_id: d.vat_id.trim() || null, legal_extra: d.legal_extra.trim() || null }).eq("id", sid),
      sb.from("services").upsert(d.services.map((s, i) => ({ id: s.id, salon_id: sid, name: s.name.trim(), duration_min: s.duration_min, price_cents: cents[i], active: true, sort: i, resource_kind: s.resource_kind || null }))),
      ...ctx.services.filter((s) => s.active && !keepSvc.has(s.id)).map((s) => sb.from("services").update({ active: false }).eq("id", s.id)),
      sb.from("staff").upsert(d.staff.map((s, i) => ({ id: s.id, salon_id: sid, name: s.name.trim(), active: true, sort: i }))),
      ...ctx.staff.filter((s) => s.active && !keepStaff.has(s.id)).map((s) => sb.from("staff").update({ active: false }).eq("id", s.id)),
    ]);
    let failed = results.some((r) => r.error);
    if (!failed) {
      const del = await sb.from("opening_hours").delete().eq("salon_id", sid);
      const rows = Object.entries(d.hours).flatMap(([w, h]) => {
        if (!h) return [];
        const parts: [number, number][] = h.pause ? [[h.open[0], h.pause[0]], [h.pause[1], h.open[1]]] : [h.open];
        return parts.map(([a, b]) => ({ salon_id: sid, weekday: Number(w), opens: hm(a), closes: hm(b) }));
      });
      const ins = rows.length ? await sb.from("opening_hours").insert(rows) : { error: null };
      failed = Boolean(del.error || ins.error);
    }
    setBusy(false);
    if (failed) return setMsg({ text: "Speichern teilweise fehlgeschlagen. Bitte erneut versuchen.", err: true });
    await ctx.reload();
    setMsg({ text: "Gespeichert" });
  }

  const tab = useSyncExternalStore(subscribeHash, currentTab, () => "salon");
  const nav = useRef<HTMLElement>(null);
  // on phones the tab bar scrolls sideways: keep the active tab in view
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);

  return (
    <div className="grid gap-6 pb-24">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">Einstellungen</h1>
        <p className="text-muted">Betrieb, Angebot, Team und Abo – nach Bereichen sortiert.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav ref={nav} aria-label="Bereiche" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:grid lg:overflow-visible lg:px-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={tab === id ? "page" : undefined}
              className="flex shrink-0 items-center gap-2.5 rounded-[10px] border border-line px-3 py-2 text-sm whitespace-nowrap text-muted hover:bg-fg/5 hover:text-fg aria-[current=page]:border-line-2 aria-[current=page]:bg-fg/7 aria-[current=page]:font-medium aria-[current=page]:text-fg lg:border-transparent"
            >
              <Icon size={16} /> {label}
            </a>
          ))}
        </nav>

        <div className="grid min-w-0 gap-6">
          {tab === "salon" && (
            <>
              <section className="card grid gap-4 p-5 sm:p-6">
                <h2 className="text-[15px] font-semibold">Betrieb</h2>
                <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
                  <Input id="s-name" label="Name" value={d.name} onChange={(v) => upd({ name: v })} />
                  <Input id="s-address" label="Adresse" value={d.address} onChange={(v) => upd({ address: v })} />
                  <Input id="s-phone" label="Telefon" value={d.phone} onChange={(v) => upd({ phone: v })} />
                </div>
                <div className="grid max-w-3xl gap-1.5">
                  <label htmlFor="s-notice" className="text-[13px] text-muted">Hinweis auf der Buchungsseite (optional)</label>
                  <textarea id="s-notice" className="input !min-h-[72px] text-sm" maxLength={500} value={d.notice} placeholder="z. B. Samstag nur nach telefonischer Vereinbarung" onChange={(e) => upd({ notice: e.target.value })} />
                </div>
                <BookingLink slug={ctx.salon.slug} name={ctx.salon.name} />
              </section>

              <MediaSection />
            </>
          )}
          {tab === "leistungen" && (
            <>
              <section className="card grid gap-4 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold">Leistungen</h2>
                  <button className="btn btn-sm" onClick={() => upd({ services: [...d.services, { id: crypto.randomUUID(), name: "", duration_min: 30, price: "0", resource_kind: "" }] })}><Plus size={16} /> Leistung</button>
                </div>
                <div className="grid gap-2">
                  <div className="hidden grid-cols-[minmax(0,1fr)_140px_120px_150px_40px] gap-2 text-xs text-muted sm:grid">
                    <span>Bezeichnung</span><span>Dauer</span><span>Preis</span><span>Braucht Platz</span><span />
                  </div>
                  {d.services.map((s, i) => (
                    <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] items-center gap-2 border-b border-line pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_140px_120px_150px_40px] sm:border-0 sm:pb-0">
                      <input aria-label="Bezeichnung" className="input input-sm col-span-3 sm:col-span-1" value={s.name} placeholder="z. B. Ölwechsel" onChange={(e) => upd({ services: d.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                      <select aria-label="Dauer" className="input input-sm" value={s.duration_min} onChange={(e) => upd({ services: d.services.map((x, j) => (j === i ? { ...x, duration_min: Number(e.target.value) } : x)) })}>
                        {DUR.map((m) => <option key={m} value={m}>{duration(m)}</option>)}
                      </select>
                      <div className="relative"><input aria-label="Preis in Euro" inputMode="decimal" className="input input-sm w-full pr-7 tabular-nums" value={s.price} onChange={(e) => upd({ services: d.services.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} /><span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">€</span></div>
                      <select aria-label="Braucht Platz" className="input input-sm col-span-2 sm:col-span-1" value={s.resource_kind} onChange={(e) => upd({ services: d.services.map((x, j) => (j === i ? { ...x, resource_kind: e.target.value as ResourceKind | "" } : x)) })}>
                        <option value="">kein Platz</option>
                        {(Object.keys(RESOURCE_KIND_LABEL) as ResourceKind[]).map((k) => <option key={k} value={k}>{RESOURCE_KIND_LABEL[k]}</option>)}
                      </select>
                      <button className="icon-btn" aria-label="Leistung entfernen" onClick={() => upd({ services: d.services.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </section>

              <VehicleClassSection />
              <StaffPriceSection />
            </>
          )}
          {tab === "team" && (
            <>
              <ResourceSection />
              <div className="grid items-start gap-6 xl:grid-cols-2">
                <section className="card grid content-start gap-4 p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-[15px] font-semibold">Team</h2>
                    <button className="btn btn-sm" onClick={() => upd({ staff: [...d.staff, { id: crypto.randomUUID(), name: "" }] })}><Plus size={16} /> Person</button>
                  </div>
                  {d.staff.map((s, i) => (
                    <div key={s.id} className="grid max-w-sm grid-cols-[minmax(0,1fr)_40px] gap-2">
                      <input aria-label="Name" className="input input-sm" value={s.name} placeholder="Vorname" onChange={(e) => upd({ staff: d.staff.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                      <button className="icon-btn" aria-label="Person entfernen" disabled={d.staff.length < 2} onClick={() => upd({ staff: d.staff.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <p className="text-xs text-dim">Entfernte Personen bleiben in alten Terminen sichtbar.</p>
                </section>

                <section className="card grid content-start gap-3 p-5 sm:p-6">
                  <h2 className="text-[15px] font-semibold">Öffnungszeiten</h2>
                  {DAYS.map(([w, label]) => {
                    const h = d.hours[w];
                    const setDay = (v: DayHours | null) => upd({ hours: { ...d.hours, [w]: v } });
                    return (
                      <div key={w} className="grid gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
                        <div className="grid grid-cols-[110px_1fr_1fr_40px] items-center gap-2 text-sm">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input type="checkbox" className="size-4.5 accent-accent" checked={!!h} onChange={(e) => setDay(e.target.checked ? { open: [540, 1080], pause: null } : null)} />
                            {label}
                          </label>
                          {h ? (
                            <>
                              <TimeSelect label={`${label} von`} value={h.open[0]} onChange={(v) => setDay({ ...h, open: [v, h.open[1]] })} />
                              <TimeSelect label={`${label} bis`} value={h.open[1]} onChange={(v) => setDay({ ...h, open: [h.open[0], v] })} />
                              <button
                                className="icon-btn"
                                aria-label={h.pause ? `Pause am ${label} entfernen` : `Pause am ${label} hinzufügen`}
                                title={h.pause ? "Pause entfernen" : "Pause hinzufügen"}
                                onClick={() => setDay({ ...h, pause: h.pause ? null : [780, 870] })}
                              >
                                {h.pause ? <X size={16} /> : <Coffee size={16} />}
                              </button>
                            </>
                          ) : (
                            <span className="col-span-3 text-muted">geschlossen</span>
                          )}
                        </div>
                        {h?.pause && (
                          <div className="grid grid-cols-[110px_1fr_1fr_40px] items-center gap-2 text-sm">
                            <span className="pl-6.5 text-muted">Pause</span>
                            <TimeSelect label={`${label} Pause von`} value={h.pause[0]} onChange={(v) => setDay({ ...h, pause: [v, h.pause![1]] })} />
                            <TimeSelect label={`${label} Pause bis`} value={h.pause[1]} onChange={(v) => setDay({ ...h, pause: [h.pause![0], v] })} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              </div>

              <ClosuresSection />
              <TeamSection />
            </>
          )}
          {tab === "nachrichten" && (
            <>
              <FollowupSection />
              <PushSection />
            </>
          )}
          {tab === "abo" && <BillingSection />}
          {tab === "rechtliches" && (
            <>
              <section className="card grid gap-4 p-5 sm:p-6">
                <div className="grid gap-1">
                  <h2 className="text-[15px] font-semibold">Impressum &amp; Datenschutz</h2>
                  <p className="text-sm text-muted">
                    Erscheint auf <a className="underline hover:text-fg" href={`/${ctx.salon.slug}/impressum`} target="_blank" rel="noreferrer">Impressum</a> und{" "}
                    <a className="underline hover:text-fg" href={`/${ctx.salon.slug}/datenschutz`} target="_blank" rel="noreferrer">Datenschutz</a>. Die Texte sind eine Vorlage, bitte einmal prüfen lassen.
                  </p>
                </div>
                {!d.legal_name.trim() && <p className="text-sm text-danger">Inhaber fehlt noch – ohne vollständiges Impressum die Buchungsseite nicht öffentlich teilen.</p>}
                <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
                  <Input id="l-name" label="Inhaber/in bzw. Firma" value={d.legal_name} onChange={(v) => upd({ legal_name: v })} />
                  <Input id="l-mail" label="E-Mail für Kunden" value={d.contact_email} onChange={(v) => upd({ contact_email: v })} />
                  <Input id="l-vat" label="USt-IdNr. (optional)" value={d.vat_id} onChange={(v) => upd({ vat_id: v })} />
                </div>
                <div className="grid max-w-3xl gap-1.5">
                  <label htmlFor="l-extra" className="text-[13px] text-muted">Weitere Angaben (z. B. Berufsbezeichnung Friseurmeisterin, Handwerkskammer Mannheim)</label>
                  <textarea id="l-extra" className="input !min-h-[72px] text-sm" maxLength={1000} value={d.legal_extra} onChange={(e) => upd({ legal_extra: e.target.value })} />
                </div>
              </section>

              <DataSection />
            </>
          )}
        </div>
      </div>

      {(dirty || msg) && (
        <div className="sticky bottom-3 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line-2 bg-card/90 p-3 backdrop-blur-md">
          {msg && <span role="status" className={`mr-auto text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</span>}
          {dirty && (
            <>
              <button className="btn btn-ghost" onClick={() => { setD(initial); setMsg(null); }}>Verwerfen</button>
              <button className="btn btn-primary" disabled={busy} onClick={save}><Save size={18} /> {busy ? "Speichert …" : "Änderungen speichern"}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Input({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] text-muted">{label}</label>
      <input id={id} className="input input-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TimeSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <select aria-label={label} className="input input-sm font-mono" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {TIMES.map((t) => <option key={t} value={t}>{hm(t)}</option>)}
    </select>
  );
}
