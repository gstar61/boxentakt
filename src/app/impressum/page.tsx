import { LegalPage } from "@/components/LegalPage";
import { OPERATOR } from "@/lib/operator";

export const metadata = { title: "Impressum" };

export default function Page() {
  return (
    <LegalPage title="Impressum">
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p className="whitespace-pre-line">{`${OPERATOR.company}\n${OPERATOR.address}`}</p>
      </section>
      <section>
        <h2>Vertreten durch</h2>
        <p>{OPERATOR.owner}</p>
      </section>
      <section>
        <h2>Kontakt</h2>
        <p className="whitespace-pre-line">{`Telefon: Keine telefonische Kontaktaufnahme vorgesehen.\nE-Mail: ${OPERATOR.email}`}</p>
      </section>
      <section>
        <h2>Registereintrag</h2>
        <p>Es besteht keine Eintragung im Handelsregister (Einzelunternehmen).</p>
      </section>
      <section>
        <h2>Umsatzsteuer-ID</h2>
        <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: nicht vorhanden</p>
      </section>
      <section>
        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p>{`${OPERATOR.owner}, ${OPERATOR.address}`}</p>
      </section>
      <section>
        <h2>Buchungsseiten der Salons</h2>
        <p>
          Für die Inhalte der Buchungsseiten (z. B. Leistungen, Preise, Öffnungszeiten) ist der jeweilige Salon verantwortlich. Sein Impressum ist
          auf der jeweiligen Buchungsseite verlinkt.
        </p>
      </section>
      <section>
        <h2>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
        <p>Wir sind nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </section>
      <section>
        <h2>Haftung für Inhalte</h2>
        <p>
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Wir sind jedoch nicht
          verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
          Tätigkeit hinweisen.
        </p>
      </section>
      <section>
        <h2>Haftung für Links</h2>
        <p>
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden
          Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten
          verantwortlich.
        </p>
      </section>
    </LegalPage>
  );
}
