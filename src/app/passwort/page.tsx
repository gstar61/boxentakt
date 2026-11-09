"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { Field } from "@/components/Field";
import { AuthCard } from "@/components/AuthBackdrop";
import { LogoMark } from "@/components/Logo";

/** Target of the reset link: the Supabase client picks up the recovery session from the URL, then the user sets a new password. */
export default function NewPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = browserClient();
    const { data } = sb.auth.onAuthStateChange((event: string, session: unknown) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    // the link may already have been exchanged before the listener was attached
    const t = setTimeout(async () => {
      const { data: s } = await sb.auth.getSession();
      setReady((r) => r ?? Boolean(s.session));
    }, 1500);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) return setMsg({ text: "Das Passwort braucht mindestens 8 Zeichen.", err: true });
    if (password !== repeat) return setMsg({ text: "Die beiden Passwörter stimmen nicht überein.", err: true });
    setBusy(true);
    const { error } = await browserClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ text: error.message.includes("different") ? "Bitte ein anderes als das bisherige Passwort wählen." : "Speichern fehlgeschlagen. Bitte den Link erneut anfordern.", err: true });
    router.replace("/dashboard");
  }

  return (
    <AuthCard className="max-w-md" back={{ href: "/login", label: "Anmelden" }}>
      <main className="grid gap-8">
        <Link href="/" className="grid size-11 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent" aria-label="Startseite">
          <LogoMark size={20} />
        </Link>
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold">Neues Passwort</h1>
          <p className="text-muted">Danach bist du direkt angemeldet.</p>
        </div>
        {ready === false ? (
          <div className="grid gap-4">
            <p className="text-sm text-danger">Der Link ist abgelaufen oder wurde schon benutzt.</p>
            <Link href="/login" className="btn btn-primary w-fit">Neuen Link anfordern</Link>
          </div>
        ) : (
          <form onSubmit={save} className="grid gap-4" noValidate>
            <Field id="pw" label="Neues Passwort" type="password" autoComplete="new-password" value={password} onChange={setPassword} />
            <Field id="pw2" label="Wiederholen" type="password" autoComplete="new-password" value={repeat} onChange={setRepeat} />
            {msg && <p role="status" className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
            <button className="btn btn-primary w-fit" disabled={busy || ready === null}>
              <KeyRound size={18} /> {ready === null ? "Link wird geprüft …" : busy ? "Speichert …" : "Passwort speichern"}
            </button>
          </form>
        )}
      </main>
    </AuthCard>
  );
}
