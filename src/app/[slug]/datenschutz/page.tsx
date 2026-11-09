import { notFound } from "next/navigation";
import { loadSalon } from "@/lib/salon";
import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Datenschutz" };

export default async function Page(props: PageProps<"/[slug]/datenschutz">) {
  const { slug } = await props.params;
  const s = await loadSalon(slug);
  if (!s) notFound();
  const owner = [s.legal_name || s.name, s.address, s.phone && `Telefon: ${s.phone}`, s.contact_email && `E-Mail: ${s.contact_email}`]
    .filter(Boolean)
    .join("\n");
  return (
    <LegalPage slug={s.slug} salonName={s.name} title="Datenschutzerklärung">
      <section>
        <h2>Verantwortlich</h2>
        <p className="whitespace-pre-line">{owner}</p>
      </section>
      <section>
        <h2>Welche Daten wir bei der Online-Buchung verarbeiten</h2>
        <p>
          Wenn Sie online einen Termin buchen, speichern wir Ihren Namen, Ihre Telefonnummer, optional Ihre E-Mail-Adresse und Ihren Hinweis
          sowie die gebuchte Leistung, Datum und Uhrzeit. Wir nutzen diese Daten ausschließlich, um den Termin zu planen, Sie bei Rückfragen zu
          erreichen, Ihnen eine Bestätigung und eine Erinnerung zu senden und Ihre bisherigen Termine bei uns nachvollziehen zu können.
        </p>
        <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung und -durchführung).</p>
        <p>
          Haben Sie eine E-Mail-Adresse angegeben, schicken wir Ihnen gegebenenfalls nach dem Termin eine Bitte um eine Google-Bewertung und später
          eine Erinnerung an einen Folgetermin (Art. 6 Abs. 1 lit. f DSGVO, § 7 Abs. 3 UWG). Dem können Sie jederzeit über den Link in jeder dieser Mails
          widersprechen.
        </p>
      </section>
      <section>
        <h2>Speicherdauer</h2>
        <p>
          Wir speichern Ihre Daten, solange Sie Kunde bei uns sind. Auf Wunsch löschen wir sie jederzeit, soweit keine gesetzlichen
          Aufbewahrungspflichten entgegenstehen.
        </p>
      </section>
      <section>
        <h2>Dienstleister</h2>
        <p>Für den Betrieb der Terminbuchung setzen wir folgende Auftragsverarbeiter ein:</p>
        <ul>
          <li>Supabase Inc. – Datenbank, Speicherort Frankfurt am Main (EU)</li>
          <li>Vercel Inc. – Hosting der Webseite, Ausführung in Frankfurt am Main; Übermittlung in die USA auf Grundlage des EU-US Data Privacy Framework</li>
          <li>Resend Inc. (USA) – Versand von Bestätigungs-, Erinnerungs- und Wartelisten-E-Mails; Übermittlung auf Grundlage der EU-Standardvertragsklauseln</li>
          {s.deposit_percent > 0 && (
            <li>Stripe Payments Europe Ltd. – Zahlungsabwicklung der Online-Anzahlung und beim Gutscheinkauf (Leistung bzw. Gutschein, Betrag, E-Mail-Adresse, Zahlungsdaten)</li>
          )}
        </ul>
      </section>
      <section>
        <h2>Reichweitenmessung</h2>
        <p>
          Wir nutzen Vercel Web Analytics und Speed Insights, um Seitenaufrufe und Ladezeiten anonym auszuwerten. Dabei werden keine Cookies
          gesetzt und keine Daten gespeichert, die Sie persönlich identifizieren. Rechtsgrundlage ist unser berechtigtes Interesse an einer
          funktionierenden Webseite (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>Die Buchungsseite setzt keine Cookies. Nur für die Anmeldung des Betriebsteams werden technisch notwendige Cookies verwendet.</p>
      </section>
      <section>
        <h2>Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Dafür
          genügt eine kurze Nachricht an uns; eine Auskunft über alle zu Ihnen gespeicherten Daten erhalten Sie innerhalb eines Monats. Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren, in Baden-Württemberg beim
          Landesbeauftragten für den Datenschutz und die Informationsfreiheit.
        </p>
      </section>
    </LegalPage>
  );
}
