"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { ReportLink } from "@/components/ErrorScene";

/** Errors inside the dashboard keep the navigation, only the page area shows this. */
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="card mx-auto grid max-w-lg justify-items-center gap-5 p-8 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-danger/10 text-danger"><AlertTriangle size={24} strokeWidth={1.75} /></span>
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">Diese Ansicht konnte nicht geladen werden</h1>
        <p className="text-sm text-muted">Termine und Kundendaten sind davon nicht betroffen. Meist hilft es, es noch einmal zu versuchen.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button className="btn btn-primary" onClick={() => retry()}><RotateCcw size={16} /> Erneut versuchen</button>
        <Link href="/dashboard" className="btn">Zum Kalender</Link>
      </div>
      <p className="text-sm text-muted">
        Passiert das öfter? <ReportLink subject="Fehler im Dashboard" digest={digest}>Melde es uns.</ReportLink>
      </p>
    </section>
  );
}
