import { LegalPage } from "@/components/LegalPage";
import { OPERATOR } from "@/lib/operator";

export const metadata = { title: "AGB" };

export default function Page() {
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen">
      <p>Stand: Oktober 2026.</p>
      <section>
        <h2>1. Geltungsbereich</h2>
        <p>
          Diese AGB gelten für alle Verträge zwischen {OPERATOR.name} (nachfolgend „Boxentakt“) und Unternehmern (§ 14 BGB) über die Nutzung der
          Software-as-a-Service-Anwendung „Boxentakt“. Abweichende Bedingungen des Kunden finden keine Anwendung, es sei denn, Boxentakt stimmt ihrer
          Geltung ausdrücklich schriftlich zu.
        </p>
      </section>
      <section>
        <h2>2. Leistungsbeschreibung</h2>
        <p>
          Boxentakt stellt eine cloudbasierte Software für Werkstätten bereit. Dazu gehören:
        </p>
        <ul>
          <li>eine eigene Online-Buchungsseite des Betriebs mit Impressum und Datenschutzerklärung</li>
          <li>ein Terminkalender pro Mitarbeiter in Tages- und Wochenansicht, mit Schutz vor Doppelbuchungen</li>
          <li>Öffnungszeiten mit Pausen, Abwesenheiten und Hinweisen für Kunden</li>
          <li>eine Kundenkartei mit Besuchen, Nichterscheinen und Notizen</li>
          <li>automatische E-Mails an Kunden: Bestätigung, Erinnerung am Vortag und Absage-Link</li>
          <li>Zugänge für weitere Teammitglieder per Einladung</li>
          <li>optional eine Online-Anzahlung bei der Buchung über das eigene Stripe-Konto des Betriebs</li>
        </ul>
        <p>
          Auf Termine, die über die Buchungsseite gebucht werden, erhebt Boxentakt keine Provision. Ein Anspruch auf bestimmte Funktionen über die
          jeweils aktuell angebotenen hinaus besteht nicht.
        </p>
      </section>
      <section>
        <h2>3. Testphase und Preise</h2>
        <p>
          Neue Betriebe können Boxentakt 30 Tage kostenlos testen, ohne Zahlungsdaten anzugeben. Danach kostet Boxentakt 29 € pro Monat oder bei jährlicher Zahlung 290 € pro Jahr. Das Abo
          schließt der Kunde ausdrücklich in den Einstellungen ab; ohne Abo nimmt die Buchungsseite nach der Testphase keine Online-Termine mehr an.
          Konto und Daten bleiben danach noch 90 Tage erhalten (mindestens 30 Tage ab der ersten Benachrichtigung) und werden dann gelöscht; der
          Kunde wird vorher mehrfach per E-Mail erinnert. Dasselbe gilt nach dem Ende eines gekündigten Abos. Preisänderungen kündigt Boxentakt mindestens 30 Tage im Voraus per E-Mail an.
        </p>
      </section>
      <section>
        <h2>4. Vertragsschluss und Registrierung</h2>
        <p>
          Der Vertrag kommt mit der erfolgreichen Registrierung eines Kontos zustande. Der Kunde sichert zu, dass seine Angaben wahrheitsgemäß und
          vollständig sind, und hält sie bei Änderungen aktuell. Das gilt insbesondere für die Angaben im Impressum seiner Buchungsseite.
        </p>
      </section>
      <section>
        <h2>5. Laufzeit und Kündigung</h2>
        <p>
          Das Monatsabo verlängert sich monatlich und kann jederzeit zum Ende des laufenden Abrechnungsmonats gekündigt werden. Das Jahresabo
          verlängert sich jährlich und kann jederzeit zum Ende des bezahlten Jahres gekündigt werden; eine anteilige Erstattung erfolgt nicht. Ein
          Wechsel zwischen monatlicher und jährlicher Zahlung ist jederzeit möglich, bereits Bezahltes wird dabei anteilig verrechnet. Kündigung und
          Wechsel erfolgen in den Einstellungen unter „Abo verwalten“ oder per E-Mail an {OPERATOR.email}. Der Vertrag über das kostenlose Konto kann
          von beiden Seiten jederzeit ohne Frist gekündigt werden.
        </p>
      </section>
      <section>
        <h2>6. Zahlungsbedingungen</h2>
        <p>
          Das Abo wird je nach Wahl monatlich oder jährlich im Voraus über den Zahlungsdienstleister Stripe abgerechnet und über die hinterlegte Zahlungsmethode eingezogen.
          Rechnungen stehen in der Abo-Verwaltung bereit. Schlägt eine Zahlung dauerhaft fehl, darf Boxentakt die Online-Buchung bis zum
          Zahlungseingang pausieren.
        </p>
      </section>
      <section>
        <h2>7. Online-Anzahlung</h2>
        <p>
          Die Online-Anzahlung ist optional. Dafür verbindet der Kunde ein eigenes Stripe-Konto und schließt dazu einen Vertrag direkt mit Stripe.
          Zahlungen seiner Endkunden gehen unmittelbar auf dieses Konto; Boxentakt ist nicht Vertragspartei dieser Zahlungen, nimmt kein Geld
          entgegen und erhebt keine Provision. Die Stripe-Gebühren trägt der Kunde. Bei einer Absage über den Absage-Link bis 24 Stunden vor dem Termin
          wird die Anzahlung automatisch erstattet. Bei späterer Absage oder Nichterscheinen behält der Kunde sie als Ausfallpauschale; dieser Regel
          stimmen Endkunden vor der Zahlung ausdrücklich zu, einschließlich des Vorbehalts, einen geringeren Schaden nachzuweisen. Weitere
          Erstattungen nimmt der Kunde selbst in seinem Stripe-Konto vor. Über dasselbe Stripe-Konto kann der Kunde Zahlungen im Betrieb per QR-Code
          annehmen; diese Funktion ist kein Kassensystem im Sinne der Kassensicherungsverordnung, die Aufzeichnungspflichten bleiben beim Kunden.
          Ebenso kann der Kunde Gutscheine online verkaufen oder im Betrieb ausstellen. Vertragspartner des Gutscheins ist allein der Kunde; er ist für
          Einlösung, Gültigkeit und die steuerliche Behandlung verantwortlich, Boxentakt stellt nur die Verwaltung der Codes und Restwerte bereit.
        </p>
      </section>
      <section>
        <h2>8. Pflichten des Kunden</h2>
        <p>
          Der Kunde behandelt seine Zugangsdaten vertraulich und informiert Boxentakt unverzüglich bei missbräuchlicher Nutzung seines Kontos. Er ist
          für die Inhalte seiner Buchungsseite (Leistungen, Preise, Öffnungszeiten, Impressum) selbst verantwortlich. Er darf Boxentakt nicht für
          rechtswidrige Zwecke nutzen, technische Schutzmaßnahmen nicht umgehen und die Verfügbarkeit für andere Kunden nicht beeinträchtigen.
        </p>
      </section>
      <section>
        <h2>9. Daten der Salonkunden</h2>
        <p>
          Für die Daten seiner Endkunden ist der Kunde datenschutzrechtlich Verantwortlicher. Boxentakt verarbeitet sie als
          Auftragsverarbeiter (Art. 28 DSGVO). Einzelheiten regelt ein Auftragsverarbeitungsvertrag, den Boxentakt auf Anfrage zur Verfügung stellt.
        </p>
      </section>
      <section>
        <h2>10. Sperrung des Kontos</h2>
        <p>
          Bei begründetem Verdacht auf missbräuchliche Nutzung oder wiederholten Verstößen gegen diese AGB darf Boxentakt das Konto vorübergehend
          sperren oder den Vertrag aus wichtigem Grund kündigen. Der Kunde wird darüber, soweit möglich, vorab informiert.
        </p>
      </section>
      <section>
        <h2>11. Verfügbarkeit</h2>
        <p>
          Boxentakt ist um eine hohe Verfügbarkeit bemüht, kann eine ununterbrochene Verfügbarkeit aber nicht garantieren. Wartungsarbeiten, Ausfälle
          bei Drittanbietern (Hosting, Datenbank, E-Mail-Versand, Zahlungsabwicklung) und höhere Gewalt sind ausgenommen.
        </p>
      </section>
      <section>
        <h2>12. Datensicherung</h2>
        <p>
          Die Datenbank wird nach dem Stand der Technik betrieben und vom Datenbankanbieter regelmäßig gesichert. Vor einer Kündigung kann der
          Kunde per E-Mail einen Export seiner Daten anfordern.
        </p>
      </section>
      <section>
        <h2>13. Updates und Weiterentwicklung</h2>
        <p>Boxentakt wird fortlaufend weiterentwickelt. Updates und neue Funktionen stehen allen Kunden automatisch zur Verfügung.</p>
      </section>
      <section>
        <h2>14. Gewährleistung und Haftung</h2>
        <p>
          Für unentgeltlich bereitgestellte Leistungen (Testphase, dauerhaft kostenlose Konten) sind Gewährleistungsansprüche im gesetzlich zulässigen Umfang ausgeschlossen.
          Boxentakt haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haftet
          Boxentakt nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypisch vorhersehbaren Schaden. Diese
          Beschränkungen gelten nicht bei Verletzung von Leben, Körper oder Gesundheit.
        </p>
      </section>
      <section>
        <h2>15. Änderung dieser AGB</h2>
        <p>
          Boxentakt darf diese AGB mit Wirkung für die Zukunft ändern, soweit das wegen geänderter rechtlicher oder technischer Rahmenbedingungen
          erforderlich ist. Über wesentliche Änderungen wird der Kunde vorab informiert.
        </p>
      </section>
      <section>
        <h2>16. Support</h2>
        <p>Support gibt es per E-Mail an {OPERATOR.email}, ohne garantierte Reaktionszeit.</p>
      </section>
      <section>
        <h2>17. Schlussbestimmungen</h2>
        <p>
          Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist, soweit gesetzlich zulässig, der Sitz
          von {OPERATOR.name} ({OPERATOR.address}). Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.
        </p>
      </section>
    </LegalPage>
  );
}
