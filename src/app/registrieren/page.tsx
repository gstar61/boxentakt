"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MailCheck, X } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { Field } from "@/components/Field";
import { toSlug } from "@/lib/slug";
import { AuthCard } from "@/components/AuthBackdrop";
import { LogoMark } from "@/components/Logo";


export default function RegisterPage() {
  const router = useRouter();
  const [salon, setSalon] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [avail, setAvail] = useState<{ slug: string; ok: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const finalSlug = slugTouched ? slug : toSlug(salon);

  useEffect(() => {
    if (finalSlug.length < 3) return;
    let live = true;
    const t = setTimeout(async () => {
      const { data } = await browserClient().rpc("slug_available", { p_slug: finalSlug });
      if (live) setAvail({ slug: finalSlug, ok: data === true });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [finalSlug]);
  const slugOk = avail?.slug === finalSlug ? avail.ok : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (salon.trim().length < 2) return setErr("Bitte den Namen des Betriebs eintragen.");
    if (finalSlug.length < 3 || slugOk === false) return setErr("Bitte eine freie Adresse für die Buchungsseite wählen.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr("Bitte eine gültige E-Mail-Adresse eintragen.");
    if (password.length < 8) return setErr("Das Passwort braucht mindestens 8 Zeichen.");
    setBusy(true);
    const { data, error } = await browserClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/login`, data: { salon_name: salon.trim(), salon_slug: finalSlug, staff_name: name.trim() } },
    });
    setBusy(false);
    if (error) return setErr(error.message.includes("registered") ? "Mit dieser E-Mail gibt es schon ein Konto. Bitte anmelden." : error.message);
    // ohne E-Mail-Bestätigung (z. B. lokal) gibt es sofort eine Sitzung
    if (data.session) return router.replace("/dashboard");
    setDone(true);
  }

  return (
    <AuthCard className="max-w-md" back={{ href: "/", label: "Startseite" }}>
      <main className="grid gap-8">
      <Link href="/" className="grid size-11 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent" aria-label="Startseite">
        <LogoMark size={20} />
      </Link>
      {done ? (
        <div className="grid gap-4">
          <MailCheck size={28} className="text-accent" />
          <h1 className="text-3xl font-semibold">Fast geschafft</h1>
          <p className="text-muted">
            Wir haben eine E-Mail an <span className="text-fg">{email}</span> geschickt. Bitte den Link darin öffnen und dich danach anmelden – dann wird
            dein Betrieb angelegt.
          </p>
          <Link href="/login" className="btn btn-primary w-fit">Zur Anmeldung</Link>
        </div>
      ) : (
        <>
          <div className="grid gap-2">
            <h1 className="text-3xl font-semibold">Betrieb anlegen</h1>
            <p className="text-muted">30 Tage kostenlos testen, danach 29 € im Monat oder 290 € im Jahr. Keine Kreditkarte nötig.</p>
          </div>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <Field id="salon" label="Name des Betriebs" value={salon} onChange={setSalon} placeholder="z. B. Autowerkstatt Meier" />
            <div className="grid gap-1.5">
              <label htmlFor="slug" className="text-[13px] text-muted">Adresse der Buchungsseite</label>
              <div className="flex items-center rounded-[14px] border border-line-2 bg-card-2 focus-within:border-accent">
                <span className="pl-4 font-mono text-sm text-dim">…/</span>
                <input
                  id="slug"
                  className="h-14 min-w-0 flex-1 bg-transparent px-1 font-mono text-[15px] outline-none"
                  value={finalSlug}
                  onChange={(e) => { setSlugTouched(true); setSlug(toSlug(e.target.value)); }}
                />
                <span className="pr-4">
                  {finalSlug.length >= 3 && slugOk === true && <Check size={18} className="text-accent" aria-label="frei" />}
                  {finalSlug.length >= 3 && slugOk === false && <X size={18} className="text-danger" aria-label="vergeben" />}
                </span>
              </div>
              {slugOk === false && <span className="text-xs text-danger">Diese Adresse ist schon vergeben.</span>}
            </div>
            <Field id="name" label="Dein Vorname (erscheint im Kalender)" value={name} onChange={setName} autoComplete="given-name" />
            <Field id="email" label="E-Mail" type="email" autoComplete="email" value={email} onChange={setEmail} />
            <Field id="password" label="Passwort (mind. 8 Zeichen)" type="password" autoComplete="new-password" value={password} onChange={setPassword} />
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <p className="text-xs text-dim">
              Mit der Registrierung gelten unsere <Link href="/agb" className="underline hover:text-fg">AGB</Link>. Infos zur Verarbeitung deiner
              Daten in der <Link href="/datenschutz" className="underline hover:text-fg">Datenschutzerklärung</Link>.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" disabled={busy}>{busy ? "Bitte warten …" : "Konto erstellen"}</button>
              <Link href="/login" className="btn btn-ghost">Schon registriert?</Link>
            </div>
          </form>
        </>
      )}
    </main>
      </AuthCard>
  );
}
