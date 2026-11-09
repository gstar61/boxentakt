"use client";

import { useCallback, useEffect, useState } from "react";
import { MailPlus, UserMinus, X } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { useSalon } from "../salon-context";
import { inviteMember } from "../actions";

type Entry = { kind: "member" | "invite"; user_id: string | null; email: string; role: "owner" | "staff" };
const ROLE = { owner: "Inhaber", staff: "Team" } as const;

export function TeamSection() {
  const { salon, role, userId } = useSalon();
  const [team, setTeam] = useState<Entry[] | null>(null);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"staff" | "owner">("staff");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await browserClient().rpc("salon_team", { p_salon: salon.id });
    setTeam((data ?? []) as Entry[]);
  }, [salon.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after the request resolves
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data } = await browserClient().auth.getSession();
    const r = data.session ? await inviteMember(data.session.access_token, salon.id, email, newRole) : { ok: false, message: "Bitte neu anmelden." };
    setBusy(false);
    setMsg({ text: r.message, err: !r.ok });
    if (r.ok) {
      setEmail("");
      load();
    }
  }

  async function revoke(mail: string) {
    await browserClient().from("salon_invites").delete().eq("salon_id", salon.id).eq("email", mail);
    load();
  }

  async function remove(uid: string) {
    const { error } = await browserClient().rpc("remove_member", { p_salon: salon.id, p_user: uid });
    setMsg(error ? { text: error.message.includes("last_owner") ? "Der letzte Inhaber kann nicht entfernt werden." : "Entfernen fehlgeschlagen.", err: true } : { text: "Zugang entfernt." });
    load();
  }

  return (
    <section className="card grid content-start gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-[15px] font-semibold">Zugänge zum Kalender</h2>
        <p className="text-sm text-muted">Wer hier steht, kann sich anmelden und Kalender, Kunden und Einstellungen sehen.</p>
      </div>
      <ul className="grid gap-1.5">
        {(team ?? []).map((t) => (
          <li key={t.kind + t.email} className="flex items-center gap-3 rounded-xl border border-line bg-card-2 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{t.email}</span>
            <span className="text-xs text-muted">{t.kind === "invite" ? "eingeladen" : ROLE[t.role]}</span>
            {t.kind === "invite" ? (
              <button className="text-muted hover:text-fg" aria-label={`Einladung an ${t.email} zurückziehen`} onClick={() => revoke(t.email)}><X size={16} /></button>
            ) : role === "owner" && t.user_id !== userId ? (
              <button className="text-muted hover:text-danger" aria-label={`Zugang von ${t.email} entfernen`} onClick={() => remove(t.user_id!)}><UserMinus size={16} /></button>
            ) : (
              <span className="w-4" />
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={invite} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]" noValidate>
        <input aria-label="E-Mail für Einladung" type="email" className="input input-sm" placeholder="E-Mail der Mitarbeiterin" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select aria-label="Rolle" className="input input-sm" value={newRole} onChange={(e) => setNewRole(e.target.value as "staff" | "owner")}>
          <option value="staff">Team</option>
          <option value="owner">Inhaber</option>
        </select>
        <button className="btn btn-sm h-[42px]" disabled={busy || !email}><MailPlus size={16} /> Einladen</button>
      </form>
      {msg && <p role="status" className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
    </section>
  );
}
