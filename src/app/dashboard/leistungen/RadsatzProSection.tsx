"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { safeBaseUrl } from "@/lib/radsatzpro-http";
import { useSalon } from "../salon-context";
import { testRadsatz } from "../integration-actions";

type Stats = { pending: number; sent: number; dead: number; lastError: string | null };

/** Verbindung zu RadsatzPro: Termine dorthin melden und eingelagerte Radsätze zum Kennzeichen anzeigen. Nur für Inhaber. */
export function RadsatzProSection() {
  const { salon, role } = useSalon();
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (role !== "owner") return;
    let live = true;
    const sb = browserClient();
    (async () => {
      const [i, ev] = await Promise.all([
        sb.from("salon_integrations").select("base_url,api_key,enabled").eq("salon_id", salon.id).maybeSingle(),
        sb.from("integration_events").select("status,last_error,created_at").eq("salon_id", salon.id).order("created_at", { ascending: false }).limit(200),
      ]);
      if (!live) return;
      const row = i.data as { base_url: string; api_key: string; enabled: boolean } | null;
      if (row) {
        setExists(true);
        setUrl(row.base_url);
        setKey(row.api_key);
        setEnabled(row.enabled);
      }
      const list = (ev.data ?? []) as { status: string; last_error: string | null }[];
      setStats({
        pending: list.filter((e) => e.status === "pending").length,
        sent: list.filter((e) => e.status === "sent").length,
        dead: list.filter((e) => e.status === "dead").length,
        lastError: list.find((e) => e.status !== "sent" && e.last_error)?.last_error ?? null,
      });
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, [salon.id, role]);

  if (role !== "owner") return null;

  async function save() {
    const base = safeBaseUrl(url);
    if (!base) return setMsg({ text: "Bitte die Adresse von RadsatzPro mit https:// eintragen, z. B. https://radsatzpro.de", err: true });
    if (key.trim().length < 16) return setMsg({ text: "Der Schlüssel ist zu kurz. Er wird in RadsatzPro unter Einstellungen erzeugt.", err: true });
    setBusy(true);
    const { error } = await browserClient()
      .from("salon_integrations")
      .upsert({ salon_id: salon.id, provider: "radsatzpro", base_url: base, api_key: key.trim(), enabled, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    setUrl(base);
    setExists(true);
    setMsg({ text: "Gespeichert" });
  }

  async function test() {
    setBusy(true);
    const { data } = await browserClient().auth.getSession();
    const r = data.session ? await testRadsatz(data.session.access_token, salon.id) : ({ ok: false, error: "Nicht angemeldet" } as const);
    setBusy(false);
    setMsg(r.ok ? { text: r.name ? `Verbunden mit ${r.name}` : "Verbunden" } : { text: r.error, err: true });
  }

  async function remove() {
    setBusy(true);
    const { error } = await browserClient().from("salon_integrations").delete().eq("salon_id", salon.id);
    setBusy(false);
    if (error) return setMsg({ text: "Trennen fehlgeschlagen.", err: true });
    setExists(false);
    setUrl("");
    setKey("");
    setMsg({ text: "Verbindung getrennt" });
  }

  return (
    <section className="card grid gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-[15px] font-semibold">Verbindung zu RadsatzPro</h2>
        <p className="text-sm text-muted">
          Neue, verschobene und abgesagte Termine werden an RadsatzPro gemeldet. Im Termin siehst du per Klick, ob zum Kennzeichen ein Radsatz eingelagert ist und wo er liegt.
          Erzeuge den Schlüssel in RadsatzPro unter Einstellungen → Boxentakt.
        </p>
      </div>
      {!loaded ? (
        <p className="text-sm text-muted">Lädt …</p>
      ) : (
        <>
          <div className="grid max-w-lg gap-3">
            <label className="grid gap-1.5 text-[13px] text-muted">
              Adresse von RadsatzPro
              <input className="input input-sm" inputMode="url" autoComplete="off" placeholder="https://radsatzpro.de" value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-[13px] text-muted">
              Schlüssel
              <input className="input input-sm font-mono" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4.5 accent-accent" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Verbindung aktiv
            </label>
          </div>
          {exists && stats && (
            <p className="text-xs text-muted">
              Letzte Ereignisse: {stats.sent} übertragen, {stats.pending} wartend{stats.dead > 0 ? `, ${stats.dead} aufgegeben` : ""}
              {stats.lastError ? ` · letzter Fehler: ${stats.lastError}` : ""}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" disabled={busy} onClick={save}>{busy ? "Bitte warten …" : "Speichern"}</button>
            {exists && <button className="btn btn-sm" disabled={busy} onClick={test}>Verbindung testen</button>}
            {exists && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>Trennen</button>}
            {msg && <span className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
