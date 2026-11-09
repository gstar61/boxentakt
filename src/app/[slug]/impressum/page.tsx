import { notFound } from "next/navigation";
import { loadSalon } from "@/lib/salon";
import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impressum" };

export default async function Page(props: PageProps<"/[slug]/impressum">) {
  const { slug } = await props.params;
  const s = await loadSalon(slug);
  if (!s) notFound();
  return (
    <LegalPage slug={s.slug} salonName={s.name} title="Impressum">
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p className="whitespace-pre-line">
          {[s.legal_name || s.name, s.legal_name ? s.name : null, s.address].filter(Boolean).join("\n")}
        </p>
      </section>
      <section>
        <h2>Kontakt</h2>
        <p className="whitespace-pre-line">
          {[s.phone && `Telefon: ${s.phone}`, s.contact_email && `E-Mail: ${s.contact_email}`].filter(Boolean).join("\n") || "–"}
        </p>
      </section>
      {s.vat_id && (
        <section>
          <h2>Umsatzsteuer-ID</h2>
          <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {s.vat_id}</p>
        </section>
      )}
      {s.legal_extra && (
        <section>
          <h2>Weitere Angaben</h2>
          <p className="whitespace-pre-line">{s.legal_extra}</p>
        </section>
      )}
      <section>
        <h2>Verbraucherstreitbeilegung</h2>
        <p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </section>
    </LegalPage>
  );
}
