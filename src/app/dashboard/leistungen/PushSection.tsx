"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Share, Smartphone } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { useSalon } from "../salon-context";
import { removePushDevice, savePushDevice, testPush } from "../push-actions";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyBytes(base64: string) {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function token() {
  const { data } = await browserClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/** "Notify me on this device about new bookings" – Web Push via the service worker. */
export function PushSection() {
  const { salon } = useSalon();
  const [state, setState] = useState<State>("loading");
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      let next: State;
      let current: PushSubscription | null = null;
      if (!VAPID || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) next = ios && !standalone ? "ios-install" : "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const reg = await navigator.serviceWorker.getRegistration("/");
        current = (await reg?.pushManager.getSubscription()) ?? null;
        next = current ? "on" : "off";
      }
      if (cancelled) return;
      setSub(current);
      setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
      const t = await token();
      const r = t ? await savePushDevice(t, salon.id, JSON.parse(JSON.stringify(s))) : { ok: false };
      if (!r.ok) {
        await s.unsubscribe();
        setMsg({ text: "Aktivieren fehlgeschlagen. Bitte erneut versuchen.", err: true });
        return;
      }
      setSub(s);
      setState("on");
      setMsg({ text: "Aktiviert. Du bekommst ab jetzt eine Nachricht bei jeder Online-Buchung." });
    } catch (e) {
      console.error(e);
      setMsg({ text: "Aktivieren fehlgeschlagen. Bitte erneut versuchen.", err: true });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!sub) return;
    setBusy(true);
    const t = await token();
    if (t) await removePushDevice(t, sub.endpoint);
    await sub.unsubscribe().catch(() => {});
    setSub(null);
    setState("off");
    setBusy(false);
    setMsg({ text: "Auf diesem Gerät ausgeschaltet." });
  }

  async function test() {
    if (!sub) return;
    setBusy(true);
    const t = await token();
    const r = t ? await testPush(t, sub.endpoint) : { ok: false };
    setBusy(false);
    setMsg(r.ok ? { text: "Test gesendet." } : { text: "Test fehlgeschlagen. Bitte aus- und wieder einschalten.", err: true });
  }

  return (
    <section className="card grid gap-5 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Bell size={16} /> Benachrichtigungen</h2>
        <p className="text-sm text-muted">Eine Nachricht aufs Handy oder den Rechner, sobald jemand online bucht. Gilt nur für dieses Gerät, jede Person im Team schaltet es selbst ein.</p>
      </div>

      {state === "ios-install" && (
        <div className="grid gap-2 rounded-xl border border-line bg-fg/[0.03] p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><Smartphone size={15} /> Auf dem iPhone erst zum Home-Bildschirm hinzufügen</p>
          <ol className="grid list-decimal gap-1 pl-5 text-muted">
            <li>In Safari unten auf <Share size={13} className="inline -translate-y-px" /> „Teilen“ tippen</li>
            <li>„Zum Home-Bildschirm“ wählen</li>
            <li>Trimtable vom Home-Bildschirm öffnen und hier einschalten</li>
          </ol>
        </div>
      )}
      {state === "unsupported" && <p className="text-sm text-muted">Dieser Browser unterstützt keine Benachrichtigungen. Chrome, Edge, Firefox oder Safari funktionieren.</p>}
      {state === "denied" && (
        <p className="flex items-start gap-2 text-sm text-muted">
          <BellOff size={15} className="mt-0.5 shrink-0" /> Benachrichtigungen sind für diese Seite blockiert. Bitte in den Browser- bzw. Handy-Einstellungen für Trimtable erlauben und die Seite neu laden.
        </p>
      )}

      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap items-center gap-3">
          {state === "off" ? (
            <button className="btn btn-primary" disabled={busy} onClick={enable}><Bell size={15} /> {busy ? "Aktiviert …" : "Auf diesem Gerät aktivieren"}</button>
          ) : (
            <>
              <span className="flex items-center gap-2 text-sm text-accent"><span className="size-2 rounded-full bg-accent" /> Aktiv auf diesem Gerät</span>
              <button className="btn" disabled={busy} onClick={test}>Test senden</button>
              <button className="btn btn-ghost" disabled={busy} onClick={disable}>Ausschalten</button>
            </>
          )}
        </div>
      )}
      {msg && <p className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
    </section>
  );
}
