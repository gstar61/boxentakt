"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { AuthCard } from "@/components/AuthBackdrop";
import { ReportLink } from "@/components/ErrorScene";

/** Fallback for unexpected errors in any page (the root layout stays). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <AuthCard className="max-w-md" back={{ href: "/", label: "Startseite" }}>
      <main className="grid justify-items-center gap-5 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-danger/10 text-danger"><AlertTriangle size={28} strokeWidth={1.75} /></span>
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold">Da ist etwas schiefgelaufen</h1>
          <p className="text-muted">Ein unerwarteter Fehler – meist reicht es, es noch einmal zu versuchen. Ihre Daten sind sicher.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button className="btn btn-primary" onClick={() => retry()}><RotateCcw size={16} /> Erneut versuchen</button>
          <Link href="/" className="btn">Zur Startseite</Link>
        </div>
        <p className="text-sm text-muted">
          Passiert das öfter? <ReportLink subject="Fehler auf boxentakt.de" digest={digest}>Melde es uns.</ReportLink>
        </p>
        {digest && <p className="font-mono text-xs text-dim">Fehler-ID {digest}</p>}
      </main>
    </AuthCard>
  );
}
