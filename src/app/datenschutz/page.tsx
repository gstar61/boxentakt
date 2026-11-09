import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { OPERATOR } from "@/lib/operator";

export const metadata = { title: "Datenschutz" };

const mail = <a href={`mailto:${OPERATOR.email}`} className="text-accent hover:underline">{OPERATOR.email}</a>;

export default function Page() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>Stand: Oktober 2026. Diese Erklärung nennt ausschließlich Dienste, die in Boxentakt tatsächlich eingesetzt werden.</p>
      <section>
        <h2>1. Verantwortlicher</h2>
        <p>
          Verantwortlich für die Datenverarbeitung auf dieser Website und in der Boxentakt-Anwendung ist {OPERATOR.name}, {OPERATOR.address},
          E-Mail: {mail}. Die vollständigen Angaben finden Sie im{" "}
          <Link href="/impressum" className="text-accent hover:underline">Impressum</Link>.
        </p>
      </section>
      <section>
        <h2>2. Übersicht der Datenverarbeitung</h2>
        <p>
          Wir verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung einer funktionsfähigen Website und unserer Software erforderlich
          ist. Rechtsgrundlagen sind je nach Fall Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung, z. B. Bereitstellung Ihres Kontos) und Art. 6 Abs. 1
          lit. f DSGVO (berechtigtes Interesse, z. B. technische Sicherheit).
        </p>
      </section>
      <section>
        <h2>3. Hosting (Vercel)</h2>
        <p>
          Website und Anwendung werden bei Vercel Inc. gehostet und in Frankfurt am Main ausgeführt. Beim Aufruf werden automatisch Verbindungsdaten
          (u. a. IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, Browser) in Server-Logfiles verarbeitet, um den technischen Betrieb sicherzustellen.
          Diese Logfiles werden nach kurzer Frist automatisch gelöscht. Eine Übermittlung in die USA erfolgt auf Grundlage des EU-US Data Privacy
          Framework.
        </p>
      </section>
      <section>
        <h2>4. Konto, Datenbank und Anmeldung (Supabase)</h2>
        <p>
          Für Registrierung, Anmeldung und Passwort-Reset sowie für die Speicherung der Salondaten (Leistungen, Öffnungszeiten, Team, Kalender,
          Kundenkartei) nutzen wir Supabase. Der Serverstandort ist Frankfurt am Main (EU). Für die Anmeldung werden technisch notwendige Cookies
          gesetzt (kein Tracking, keine Werbung).
        </p>
      </section>
      <section>
        <h2>5. E-Mail-Versand (Resend)</h2>
        <p>
          Bestätigungs-, Erinnerungs-, Absage- und Wartelisten-E-Mails zu Terminen sowie die E-Mails zur Registrierung, Team-Einladung und zum
          Zurücksetzen des Passworts versenden wir über den E-Mail-Dienst Resend (Resend Inc., USA) von der Adresse termine@boxentakt.de. Dabei werden
          die E-Mail-Adresse des Empfängers und der Inhalt der Nachricht verarbeitet. Die Übermittlung in die USA erfolgt auf Grundlage der
          EU-Standardvertragsklauseln.
        </p>
      </section>
      <section>
        <h2>6. Zahlungen (Stripe)</h2>
        <p>
          Das Boxentakt-Abo rechnen wir über Stripe Payments Europe Ltd. (Dublin, Irland) ab. Beim Abschluss gibt der Salon Name, Rechnungsadresse,
          optional eine Umsatzsteuer-ID und seine Zahlungsmethode direkt bei Stripe ein; Zahlungsdaten laufen nicht über unsere Server. Wir speichern
          nur die Kunden- und Abo-Kennung sowie den Abo-Status. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
        </p>
        <p>
          Nutzt ein Salon die Online-Anzahlung, zahlen seine Kundinnen und Kunden über das eigene Stripe-Konto des Salons. Verantwortlich für diese
          Zahlungen sind der Salon und Stripe; wir übermitteln dafür Leistung, Termin, Betrag und die E-Mail-Adresse an Stripe und speichern den
          Zahlungsstatus am Termin. Beim Online-Kauf eines Gutscheins gilt dasselbe; gespeichert werden Betrag, Code, Name und E-Mail-Adresse der
          käufenden Person sowie optional Empfängername und Nachricht, damit der Gutschein zugestellt und im Salon eingelöst werden kann.
        </p>
      </section>
      <section>
        <h2>7. Reichweitenmessung (Vercel Web Analytics &amp; Speed Insights)</h2>
        <p>
          Wir werten Seitenaufrufe und Ladezeiten mit Vercel Web Analytics und Speed Insights statistisch aus. Dabei werden keine Cookies gesetzt und
          keine Profile gespeichert, die Sie persönlich identifizieren. Rechtsgrundlage ist unser berechtigtes Interesse an einer funktionierenden
          Website (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </section>
      <section>
        <h2>8. Cookies</h2>
        <p>
          Wir setzen ausschließlich technisch notwendige Cookies ein, um die Anmeldung des Salon-Teams aufrechtzuerhalten. Die öffentlichen
          Buchungsseiten setzen keine Cookies. Cookies zu Werbe- oder Tracking-Zwecken verwenden wir nicht.
        </p>
      </section>
      <section>
        <h2>9. Daten der Salonkunden</h2>
        <p>
          Wenn Kundinnen und Kunden über eine Buchungsseite einen Termin buchen, ist der jeweilige Salon für diese Daten verantwortlich. Seine eigene
          Datenschutzerklärung ist auf der Buchungsseite verlinkt. Boxentakt verarbeitet diese Daten im Auftrag des Salons (Art. 28 DSGVO). Einen
          Auftragsverarbeitungsvertrag (AVV) stellen wir auf Anfrage zur Verfügung.
        </p>
      </section>
      <section>
        <h2>10. Speicherdauer</h2>
        <p>
          Wir speichern personenbezogene Daten nur so lange, wie es für die jeweiligen Zwecke erforderlich ist oder gesetzliche Aufbewahrungspflichten
          bestehen. Salons ohne aktive Testphase oder Abo löschen wir 90 Tage nach Ende des Zugangs automatisch mit allen Terminen, Kundendaten
          und Logins; die Inhaber werden vorher per E-Mail erinnert (sofort, 30, 7 und 1 Tag vorher). Rechnungsdaten bewahrt Stripe für die
          gesetzlichen Fristen auf. Für die sofortige vollständige Löschung eines Kontos genügt eine E-Mail an {mail}.
        </p>
      </section>
      <section>
        <h2>11. Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
          Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren, in
          Baden-Württemberg beim Landesbeauftragten für den Datenschutz und die Informationsfreiheit.
        </p>
        <p>
          Salon-Inhaber laden alle zu ihrem Salon und Konto gespeicherten Daten jederzeit selbst unter Einstellungen → „Daten &amp; Datenschutz“
          herunter. Kundinnen und Kunden eines Salons wenden sich für eine Auskunft an den jeweiligen Salon, der dafür verantwortlich ist; wir
          unterstützen ihn dabei. Anfragen beantworten wir spätestens innerhalb eines Monats.
        </p>
      </section>
      <section>
        <h2>12. Kontakt für Datenschutzanfragen</h2>
        <p>Bei Fragen zum Datenschutz erreichen Sie uns unter {mail}.</p>
      </section>
    </LegalPage>
  );
}
