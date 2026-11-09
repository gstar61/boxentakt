"use client";

import { useEffect } from "react";
import { GeistSans } from "geist/font/sans";
import { AlertTriangle, RotateCcw } from "lucide-react";
import "./globals.css";
import { ReportLink } from "@/components/ErrorScene";

/** Last resort when even the root layout fails: own document, follows the OS colour scheme. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="de" className={`${GeistSans.variable} h-full`}>
      <body className="grid min-h-full place-items-center px-4">
        <title>Fehler · Trimtable</title>
        <main className="card grid w-full max-w-md justify-items-center gap-5 p-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-danger/10 text-danger"><AlertTriangle size={28} strokeWidth={1.75} /></span>
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold">Da ist etwas schiefgelaufen</h1>
            <p className="text-muted">Trimtable konnte nicht geladen werden. Bitte gleich noch einmal versuchen.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button className="btn btn-primary" onClick={() => retry()}><RotateCcw size={16} /> Erneut versuchen</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the app shell failed, a full page load is the safer way back */}
            <a href="/" className="btn">Zur Startseite</a>
          </div>
          <p className="text-sm text-muted">
            Bleibt der Fehler? <ReportLink subject="Fehler auf trimtable.de" digest={digest}>Melde es uns.</ReportLink>
          </p>
        </main>
      </body>
    </html>
  );
}
