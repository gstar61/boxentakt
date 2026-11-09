import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Without `slug` the page belongs to the platform itself and links back to the landing page. */
export function LegalPage({ slug, salonName = "Boxentakt", title, children }: { slug?: string; salonName?: string; title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid max-w-2xl gap-8 px-4 py-12">
      <Link href={slug ? `/${slug}` : "/"} className="btn btn-ghost btn-sm w-fit">
        <ArrowLeft size={16} /> {slug ? "Zurück zur Buchung" : "Zur Startseite"}
      </Link>
      <div className="grid gap-2">
        <span className="label">{salonName}</span>
        <h1 className="text-3xl font-semibold">{title}</h1>
      </div>
      <div className="grid gap-6 text-[15px] leading-relaxed text-fg/90 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg [&_p]:text-muted [&_section]:grid [&_section]:gap-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted">
        {children}
      </div>
    </main>
  );
}

export function LegalFooter({ slug }: { slug: string }) {
  return (
    <footer className="flex flex-wrap gap-4 border-t border-line pt-6 text-xs text-dim">
      <Link href={`/${slug}/impressum`} className="hover:text-fg">Impressum</Link>
      <Link href={`/${slug}/datenschutz`} className="hover:text-fg">Datenschutz</Link>
      <Link href="/" className="ml-auto hover:text-fg">Terminbuchung mit Boxentakt</Link>
    </footer>
  );
}
