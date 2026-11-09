"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { toSlug } from "@/lib/slug";
import { TextField } from "./ui";

const ERRORS: Record<string, string> = {
  slug_taken: "Diese Adresse ist schon vergeben. Bitte eine andere wählen.",
  invalid_name: "Bitte einen Salonnamen mit mindestens 2 Zeichen eintragen.",
  not_confirmed: "Bitte zuerst die E-Mail-Adresse bestätigen.",
  too_many_salons: "Du hast bereits 3 Salons angelegt.",
};

/** Shown when a signed-in user has no salon yet. */
export function Onboarding(props: { email: string; meta: Record<string, string>; onCreated: () => void }) {
  const [name, setName] = useState(props.meta.salon_name ?? "");
  const [slug, setSlug] = useState(props.meta.salon_slug ?? "");
  const [staff, setStaff] = useState(props.meta.staff_name ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finalSlug = slug || toSlug(name);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await browserClient().rpc("create_salon", { p_name: name, p_slug: finalSlug, p_staff_name: staff });
    setBusy(false);
    if (error) return setErr(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? "Anlegen fehlgeschlagen.");
    props.onCreated();
  }

  return (
    <div className="card grid max-w-xl gap-6 p-8">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent"><Store size={22} strokeWidth={1.75} /></span>
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Salon anlegen</h1>
        <p className="text-muted">
          Mit {props.email} ist noch kein Salon verbunden. Lege jetzt deinen Salon an – Leistungen, Öffnungszeiten und Team passt du danach an.
          Wenn du zu einem bestehenden Salon eingeladen wurdest, bitte die Inhaberin, dich mit genau dieser Adresse einzuladen.
        </p>
      </div>
      <form onSubmit={create} className="grid gap-3.5" noValidate>
        <TextField id="o-name" label="Name des Salons" value={name} onChange={setName} />
        <TextField id="o-slug" label={`Adresse der Buchungsseite: …/${finalSlug || "dein-salon"}`} value={slug} onChange={(v) => setSlug(toSlug(v))} />
        <TextField id="o-staff" label="Dein Vorname (erscheint im Kalender)" value={staff} onChange={setStaff} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Wird angelegt …" : "Salon anlegen"}</button>
        </div>
      </form>
    </div>
  );
}
