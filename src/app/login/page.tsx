"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { Field } from "@/components/Field";
import { AuthCard } from "@/components/AuthBackdrop";
import { LogoMark } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function forgot() {
    setMsg(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setMsg({ text: "Bitte oben deine E-Mail eintragen, dann noch einmal auf „Passwort vergessen?“ tippen.", err: true });
    setBusy(true);
    const { error } = await browserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/passwort` });
    setBusy(false);
    setMsg(error ? { text: "Senden fehlgeschlagen. Bitte in ein paar Minuten erneut versuchen.", err: true } : { text: "Wenn ein Konto zu dieser Adresse existiert, ist ein Link zum Zurücksetzen unterwegs." });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) return setMsg({ text: "Das Passwort braucht mindestens 8 Zeichen.", err: true });
    setBusy(true);
    const sb = browserClient();
    if (mode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg({ text: error.message.includes("confirmed") ? "Bitte zuerst den Link in der Bestätigungs-Mail öffnen." : "E-Mail oder Passwort stimmt nicht.", err: true });
      router.replace("/dashboard");
    } else {
      const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/login` } });
      setBusy(false);
      if (error) return setMsg({ text: error.message, err: true });
      setMsg({ text: "Konto angelegt. Bitte den Link in der Bestätigungs-Mail öffnen und dich danach hier anmelden." });
      setMode("login");
    }
  }

  return (
    <AuthCard className="max-w-md" back={{ href: "/", label: "Startseite" }}>
      <main className="grid gap-8">
      <Link href="/" className="grid size-11 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent" aria-label="Startseite">
        <LogoMark size={20} />
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold">{mode === "login" ? "Anmelden" : "Konto anlegen"}</h1>
        <p className="text-muted">Für Betriebsinhaber und Team. Kunden buchen ohne Konto.</p>
      </div>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field id="email" label="E-Mail" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <div className="grid gap-1.5">
          <Field id="password" label="Passwort" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={setPassword} />
          {mode === "login" && (
            <button type="button" className="justify-self-end text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline" onClick={forgot} disabled={busy}>
              Passwort vergessen?
            </button>
          )}
        </div>
        {msg && <p role="status" className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy}>
            {mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
            {busy ? "Bitte warten …" : mode === "login" ? "Anmelden" : "Konto anlegen"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(null); }}>
            {mode === "login" ? "Noch kein Konto?" : "Schon registriert?"}
          </button>
        </div>
      </form>
      <p className="text-sm text-muted">
        Neuer Betrieb? <Link href="/registrieren" className="text-fg underline underline-offset-4">Hier kostenlos registrieren</Link>
      </p>
    </main>
      </AuthCard>
  );
}
