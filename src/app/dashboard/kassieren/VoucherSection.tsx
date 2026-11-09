"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Gift, Search, Ticket } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { euro } from "@/lib/time";
import { useSalon } from "../salon-context";

type Voucher = { id: string; code: string; token: string; amount_cents: number; balance_cents: number; status: string; source: string; buyer_name: string | null; recipient_name: string | null; created_at: string; valid_until: string };
type Lookup = { code: string; amount_cents: number; balance_cents: number; status: string; valid_until: string; recipient_name: string | null; buyer_name: string | null };

const ERR: Record<string, string> = {
  voucher_not_found: "Diesen Gutschein gibt es nicht oder er ist nicht gültig.",
  voucher_expired: "Dieser Gutschein ist abgelaufen.",
  insufficient_balance: "Der Betrag ist höher als der Restwert.",
  invalid_amount: "Bitte einen gültigen Betrag eingeben.",
};
const cents = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);
const deDate = (d: string) => `${Number(d.slice(8))}.${Number(d.slice(5, 7))}.${d.slice(0, 4)}`;

/** Sell vouchers online, issue them at the counter, check and redeem codes. */
export function VoucherSection({ paymentsReady }: { paymentsReady: boolean | null }) {
  const { salon, role, reload } = useSalon();
  const [list, setList] = useState<Voucher[]>([]);
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Lookup | null>(null);
  const [redeem, setRedeem] = useState("");
  const [issueAmount, setIssueAmount] = useState("");
  const [issueFor, setIssueFor] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await browserClient()
      .from("vouchers")
      .select("id,code,token,amount_cents,balance_cents,status,source,buyer_name,recipient_name,created_at,valid_until")
      .eq("salon_id", salon.id)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    setList((data ?? []) as Voucher[]);
  }, [salon.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after the request resolves
    load();
  }, [load]);

  async function toggleOnline(on: boolean) {
    const { error } = await browserClient().from("salons").update({ vouchers_enabled: on }).eq("id", salon.id);
    if (error) return setMsg({ text: "Speichern fehlgeschlagen.", err: true });
    await reload();
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setFound(null);
    const { data } = await browserClient().rpc("voucher_lookup", { p_salon: salon.id, p_code: code });
    if (!data) return setMsg({ text: ERR.voucher_not_found, err: true });
    setFound(data as Lookup);
    setRedeem(String((data as Lookup).balance_cents / 100).replace(".", ","));
  }

  async function doRedeem() {
    if (!found) return;
    setBusy(true);
    const { data, error } = await browserClient().rpc("voucher_redeem", { p_salon: salon.id, p_code: found.code, p_amount: cents(redeem) });
    setBusy(false);
    if (error) return setMsg({ text: ERR[Object.keys(ERR).find((k) => error.message.includes(k)) ?? ""] ?? "Einlösen fehlgeschlagen.", err: true });
    const rest = (data as { balance_cents: number }).balance_cents;
    setMsg({ text: `${euro(cents(redeem))} eingelöst. Restwert ${euro(rest)}.` });
    setFound(null);
    setCode("");
    load();
  }

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const amount = cents(issueAmount);
    if (!Number.isFinite(amount) || amount < 500 || amount > 100000) return setMsg({ text: "Bitte einen Betrag zwischen 5 und 1.000 € eingeben.", err: true });
    setBusy(true);
    const { data, error } = await browserClient().rpc("voucher_issue", { p_salon: salon.id, p_amount: amount, p_recipient: issueFor, p_message: null });
    setBusy(false);
    if (error || !data) return setMsg({ text: "Ausstellen fehlgeschlagen.", err: true });
    setIssueAmount("");
    setIssueFor("");
    window.open(`/gutschein/${(data as { token: string }).token}`, "_blank");
    setMsg({ text: `Gutschein ${(data as { code: string }).code} ausgestellt – zum Drucken im neuen Tab geöffnet.` });
    load();
  }

  const online = salon.vouchers_enabled;

  return (
    <section className="card grid max-w-xl gap-5 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Gift size={16} /> Gutscheine</h2>
        <p className="text-sm text-muted">Online verkaufen, im Betrieb ausstellen und beim Bezahlen einlösen – auch in Teilbeträgen.</p>
      </div>

      {role === "owner" && (
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4.5 accent-accent" checked={online} disabled={!paymentsReady} onChange={(e) => toggleOnline(e.target.checked)} />
          <span className="grid gap-0.5">
            <span className="font-medium">Online auf der Buchungsseite verkaufen</span>
            <span className="text-muted">
              {paymentsReady
                ? <>Kunden kaufen unter <a className="underline hover:text-fg" href={`/${salon.slug}/gutschein`} target="_blank" rel="noreferrer">/{salon.slug}/gutschein</a> und bekommen den Gutschein per Mail. Das Geld geht direkt auf dein Stripe-Konto.</>
                : "Dafür zuerst unter Einstellungen → Online-Zahlungen Stripe verbinden."}
            </span>
          </span>
        </label>
      )}

      <form onSubmit={lookup} className="grid gap-2">
        <label htmlFor="v-code" className="text-[13px] text-muted">Gutschein prüfen und einlösen</label>
        <div className="flex gap-2">
          <input id="v-code" className="input input-sm flex-1 font-mono uppercase" placeholder="TT-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn-sm" disabled={code.trim().length < 6}><Search size={15} /> Prüfen</button>
        </div>
      </form>
      {found && (
        <div className="grid gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-mono font-semibold">{found.code}</span>
            <span>Restwert <span className="font-semibold tabular-nums">{euro(found.balance_cents)}</span> von {euro(found.amount_cents)}</span>
          </div>
          <span className="text-muted">Gültig bis {deDate(found.valid_until)}{found.recipient_name ? ` · für ${found.recipient_name}` : ""}{found.buyer_name ? ` · gekauft von ${found.buyer_name}` : ""}</span>
          {found.balance_cents > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Betrag einlösen in Euro" inputMode="decimal" className="input input-sm w-28 tabular-nums" value={redeem} onChange={(e) => setRedeem(e.target.value)} />
              <span className="text-muted">€</span>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={doRedeem}><Ticket size={15} /> Einlösen</button>
            </div>
          ) : <span className="text-muted">Vollständig eingelöst.</span>}
        </div>
      )}

      <form onSubmit={issue} className="grid gap-2">
        <span className="text-[13px] text-muted">Gutschein im Betrieb ausstellen (z. B. bar bezahlt)</span>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Betrag in Euro" inputMode="decimal" className="input input-sm w-28 tabular-nums" placeholder="Betrag €" value={issueAmount} onChange={(e) => setIssueAmount(e.target.value)} />
          <input aria-label="Für wen (optional)" className="input input-sm min-w-0 flex-1" placeholder="Für wen? (optional)" value={issueFor} onChange={(e) => setIssueFor(e.target.value)} />
          <button className="btn btn-sm" disabled={busy}>Ausstellen</button>
        </div>
      </form>

      {msg && <p className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}

      {list.length > 0 && (
        <div className="grid gap-1.5">
          <span className="label">Zuletzt</span>
          {list.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-mono font-medium">{v.code}</span>
                <span className="text-muted"> · {v.source === "online" ? `online${v.buyer_name ? `, ${v.buyer_name}` : ""}` : "im Betrieb"}{v.recipient_name ? ` · für ${v.recipient_name}` : ""}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                <span className={v.balance_cents ? "" : "text-dim"}>{euro(v.balance_cents)}<span className="text-dim"> / {euro(v.amount_cents)}</span></span>
                <a className="icon-btn" href={`/gutschein/${v.token}`} target="_blank" rel="noreferrer" aria-label={`Gutschein ${v.code} öffnen`}><ExternalLink size={15} /></a>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
