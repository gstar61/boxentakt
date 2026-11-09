"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Bug, Heart, Lightbulb, MessageSquareText, Send } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { Drawer } from "./ui";
import { submitFeedback } from "./feedback-actions";

const KINDS = [
  { id: "idee", label: "Idee", icon: Lightbulb, hint: "Was fehlt dir? Was würde dir im Alltag Zeit sparen?" },
  { id: "problem", label: "Problem", icon: Bug, hint: "Was ist passiert, und was hast du stattdessen erwartet?" },
  { id: "lob", label: "Lob", icon: Heart, hint: "Was gefällt dir? Das hilft uns genauso." },
] as const;

/** Quiet link at the bottom of the dashboard + drawer: salons tell us what to build next. */
export function FeedbackButton({ salonId }: { salonId: string | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("idee");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = KINDS.find((k) => k.id === kind)!;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data } = await browserClient().auth.getSession();
    const r = data.session ? await submitFeedback(data.session.access_token, { salonId, kind, message: text, page: path }) : { ok: false, message: "Bitte neu anmelden." };
    setBusy(false);
    setMsg({ text: r.message, err: !r.ok });
    if (r.ok) setText("");
  }

  return (
    <>
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-[13px] text-dim">
        <MessageSquareText size={14} /> Fehlt dir etwas oder hakt es irgendwo?
        <button onClick={() => { setOpen(true); setMsg(null); }} className="underline underline-offset-4 hover:text-fg">Feedback geben</button>
      </p>
      {/* portal: the drawer must not be trapped inside a parent with backdrop-filter or transforms */}
      {open && createPortal(
        <Drawer title="Feedback" eyebrow="Direkt an das Boxentakt-Team" onClose={() => setOpen(false)}>
          <p className="text-sm text-muted">Boxentakt wird mit den Salons gebaut, die es jeden Tag benutzen. Jede Nachricht landet bei uns persönlich, keine Warteschleife.</p>
          <form onSubmit={send} className="grid gap-4" noValidate>
            <div role="radiogroup" aria-label="Art" className="grid grid-cols-3 gap-2">
              {KINDS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={kind === id}
                  onClick={() => setKind(id)}
                  className="grid justify-items-center gap-1.5 rounded-xl border border-line py-3 text-sm font-medium text-muted transition-colors hover:text-fg aria-checked:border-accent aria-checked:bg-accent/10 aria-checked:text-fg"
                >
                  <Icon size={18} strokeWidth={1.75} /> {label}
                </button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="fb-text" className="text-[13px] text-muted">{current.hint}</label>
              <textarea id="fb-text" className="input !min-h-[140px] text-sm" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            </div>
            {msg && <p role="status" className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
            <button className="btn btn-primary w-fit" disabled={busy || text.trim().length < 3}>
              <Send size={16} /> {busy ? "Sendet …" : "Senden"}
            </button>
          </form>
        </Drawer>,
        document.body,
      )}
    </>
  );
}
