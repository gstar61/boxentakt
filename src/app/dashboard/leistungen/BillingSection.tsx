"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Wallet } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { useSalon } from "../salon-context";
import { openBillingPortal, startConnect, startSubscription, syncBilling } from "../billing-actions";

export type BillingRow = {
  exempt: boolean;
  trial_ends_at: string;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  /** inactive salons are deleted on this date unless a subscription starts */
  delete_after?: string | null;
};

const date = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
export const trialDaysLeft = (b: BillingRow) => Math.max(0, Math.ceil((Date.parse(b.trial_ends_at) - Date.now()) / 86_400_000));
export const subscribed = (b: BillingRow) => ["active", "trialing", "past_due"].includes(b.subscription_status ?? "");

async function token() {
  const { data } = await browserClient().auth.getSession();
  return data.session?.access_token ?? "";
}

export function BillingSection() {
  const { salon, role, reload } = useSalon();
  const owner = role === "owner";
  const [b, setB] = useState<BillingRow | null>(null);
  const [percent, setPercent] = useState(String(salon.deposit_percent));
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const from = q.get("abo") ? "abo" : q.get("stripe") === "zurueck" ? "connect" : q.get("stripe") === "neu" ? "expired" : null;
    if (from) history.replaceState(null, "", location.pathname);
    const fetchRow = async () => {
      const { data } = await browserClient().from("salon_billing").select("*").eq("salon_id", salon.id).maybeSingle();
      const row = data as BillingRow | null;
      setB(row);
      return row;
    };
    const done = (r: BillingRow | null) => (from === "abo" ? !!r && subscribed(r) : !!r?.charges_enabled);
    (async () => {
      let row = await fetchRow();
      if (from === "expired") return setToast({ text: "Der Stripe-Link war abgelaufen. Bitte noch einmal auf „Stripe-Einrichtung fortsetzen“ klicken.", err: true });
      const pending = from || (row?.stripe_account_id && !row.charges_enabled);
      if (!owner || !pending) return;
      // back from Stripe: the new state can take a few seconds, so re-check a couple of times
      for (let i = 0; i < (from ? 6 : 1) && !done(row); i++) {
        if (i) await new Promise((r) => setTimeout(r, 2500));
        await syncBilling(await token(), salon.id);
        row = await fetchRow();
      }
      if (from === "abo")
        setToast(done(row) ? { text: "Das Abo ist abgeschlossen. Danke!" } : { text: "Die Zahlung wird noch bestätigt. Der Status erscheint gleich hier." });
      if (from === "connect")
        setToast(
          done(row)
            ? { text: "Stripe ist verbunden. Jetzt die Anzahlung in Prozent festlegen." }
            : { text: "Stripe prüft die Angaben noch. Das kann ein paar Minuten dauern, danach erscheint hier die Anzahlung." },
        );
    })();
  }, [owner, salon.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  async function go(action: (token: string, salonId: string) => ReturnType<typeof startSubscription>) {
    setBusy(true);
    setMsg(null);
    setLeaving(true);
    const r = await action(await token(), salon.id);
    if (r.ok) return (location.href = r.url);
    setLeaving(false);
    setBusy(false);
    setMsg({ text: r.message, err: true });
  }

  async function saveDeposit() {
    const p = Number(percent);
    if (!Number.isInteger(p) || p < 0 || p > 100) return setMsg({ text: "Bitte einen Prozentwert zwischen 0 und 100 eintragen.", err: true });
    setBusy(true);
    const { error } = await browserClient().from("salons").update({ deposit_percent: p }).eq("id", salon.id);
    setBusy(false);
    if (error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    await reload();
    setMsg({ text: p ? `Anzahlung von ${p} % ist aktiv.` : "Anzahlung ist ausgeschaltet." });
  }

  if (!b) return null;
  const days = trialDaysLeft(b);

  return (
    <>
      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 md:bottom-5 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl ${toast.err ? "bg-danger text-danger-ink" : "bg-fg text-bg"}`}
        >
          {toast.err ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />} {toast.text}
        </div>
      )}
      <section className="card grid gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <CreditCard size={16} className="text-muted" />
          <h2 className="text-[15px] font-semibold">Abo</h2>
        </div>
        {b.exempt ? (
          <p className="text-sm text-muted">Dieser Salon nutzt Boxentakt dauerhaft kostenlos.</p>
        ) : subscribed(b) ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted">
              Boxentakt-Abo ist {b.subscription_status === "past_due" ? <span className="text-danger">aktiv, letzte Zahlung offen</span> : "aktiv"}.
              {b.current_period_end && (b.cancel_at_period_end ? ` Endet am ${date(b.current_period_end)}.` : ` Nächste Abrechnung am ${date(b.current_period_end)}.`)}
            </p>
            {owner && (
              <button className="btn w-fit" disabled={busy} onClick={() => go(openBillingPortal)}>
                <ExternalLink size={16} /> Abo verwalten
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <p className={`text-sm ${days ? "text-muted" : "text-danger"}`}>
              {days
                ? `Testphase bis ${date(b.trial_ends_at)} (noch ${days} ${days === 1 ? "Tag" : "Tage"}). Danach 29 € pro Monat oder 290 € pro Jahr.`
                : "Die Testphase ist abgelaufen. Die Buchungsseite nimmt keine Online-Termine an, bis das Abo aktiv ist."}
            </p>
            {owner ? (
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={busy} onClick={() => go((t, s) => startSubscription(t, s, "year"))}>
                  Jährlich: 290 € <span className="rounded-md bg-accent-ink/15 px-1.5 py-0.5 text-xs">2 Monate gratis</span>
                </button>
                <button className="btn h-[52px] rounded-[14px] px-5" disabled={busy} onClick={() => go((t, s) => startSubscription(t, s, "month"))}>
                  Monatlich: 29 €
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">Das Abo kann nur ein Inhaber abschließen.</p>
            )}
          </div>
        )}
      </section>

      <section className="card grid gap-4 p-5 sm:p-6">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-muted" />
            <h2 className="text-[15px] font-semibold">Online-Anzahlung</h2>
          </div>
          <p className="text-sm text-muted">
            Kunden zahlen bei der Buchung einen Teil des Preises per Karte, direkt auf dein eigenes Stripe-Konto. Bei Absage bis 24 Stunden vorher wird
            automatisch erstattet, sonst behältst du die Anzahlung. Boxentakt nimmt keine Provision, es fallen nur die Stripe-Gebühren an.
          </p>
        </div>
        {!b.charges_enabled ? (
          owner ? (
            <button className="btn w-fit" disabled={busy} onClick={() => go(startConnect)}>
              <ExternalLink size={16} /> {b.stripe_account_id ? "Stripe-Einrichtung fortsetzen" : "Mit Stripe verbinden"}
            </button>
          ) : (
            <p className="text-sm text-muted">Stripe kann nur ein Inhaber verbinden.</p>
          )
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="dep" className="text-[13px] text-muted">Anzahlung in % vom Preis (0 = aus)</label>
              <input id="dep" className="input input-sm w-32" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </div>
            <button className="btn" disabled={busy || percent === String(salon.deposit_percent)} onClick={saveDeposit}>Speichern</button>
            <span className="text-sm text-accent">Stripe ist verbunden.</span>
          </div>
        )}
        {leaving && <p className="text-sm text-muted">Weiterleitung zu Stripe …</p>}
        {msg && <p className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
      </section>
    </>
  );
}
