import Link from "next/link";
import { Compass } from "lucide-react";
import { AuthCard } from "@/components/AuthBackdrop";
import { ReportLink, SnipScene } from "@/components/ErrorScene";

export const metadata = { title: "Seite nicht gefunden", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <AuthCard className="max-w-md" back={{ href: "/", label: "Startseite" }}>
      <main className="grid justify-items-center gap-5 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent"><Compass size={28} strokeWidth={1.75} /></span>
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold">Diese Seite gibt es nicht</h1>
          <p className="text-muted">Der Link ist veraltet oder hat einen Tippfehler. Den Buchungslink Ihres Salons finden Sie in dessen Google-Profil oder auf Instagram.</p>
        </div>
        <Link href="/" className="btn btn-primary">Zur Startseite</Link>
        <p className="text-sm text-muted">
          Auf einen kaputten Link gestoßen? <ReportLink subject="Kaputter Link auf boxentakt.de">Melde es uns.</ReportLink>
        </p>
        <div className="mt-2 w-full border-t border-line pt-6"><SnipScene /></div>
      </main>
    </AuthCard>
  );
}
