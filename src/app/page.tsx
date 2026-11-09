import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { SLOGAN } from "@/lib/brand";
import { faqSchema, organizationSchema, softwareSchema, SITE, websiteSchema } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { MadeInMannheim } from "@/components/MadeInMannheim";
import type { Metadata } from "next";
import QRCode from "qrcode";
import {
  ArrowRight,
  BadgeEuro,
  BellRing,
  CalendarCheck2,
  CalendarDays,
  CalendarX2,
  Check,
  Layers,
  LifeBuoy,
  Link2,
  ListPlus,
  LockOpen,
  Percent,
  PhoneOff,
  ShieldCheck,
  Star,
  Store,
  TreePalm,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CounterCard, PhoneBooking, PhonePay, ReminderStack, StatsPreview, VoucherStack } from "@/components/landing/Mockups";
import { PricingCard, SavingsCalculator } from "@/components/landing/Interactive";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} – ${SITE.tagline}` },
  description: SITE.description,
  alternates: { canonical: "/" },
};

/** Recurring complaints about booking marketplaces (trade press, reviews, salon forums) and how Trimtable answers them. */
const PROBLEMS = [
  { icon: Percent, pain: "„35 % vom ersten Termin gehen an die Plattform.“", fix: "Keine Provision. Ein fester Preis, egal wie viele Neukunden kommen." },
  { icon: UserCheck, pain: "„Meine Stammkundin wurde als Neukundin abgerechnet.“", fix: "Es gibt keine Neukunden-Einstufung, also nichts nachzuprüfen oder zu reklamieren." },
  { icon: LockOpen, pain: "„Neue Gebühren – sonst ist der Kalender weg.“", fix: "Monatlich kündbar, Preisänderungen 30 Tage vorher, Kundendaten jederzeit als Export." },
  { icon: LifeBuoy, pain: "„Support gibt es nur im Chat oder gegen Aufpreis.“", fix: "Persönlicher Support per E-Mail ist im Preis enthalten." },
  { icon: CalendarX2, pain: "„Samstag 10 Uhr, der Stuhl bleibt leer.“", fix: "Erinnerung am Vortag, Absage-Link gibt den Termin frei, auf Wunsch Anzahlung." },
  { icon: PhoneOff, pain: "„Das Telefon klingelt mitten im Färben.“", fix: "Online-Buchung rund um die Uhr, dazu ein QR-Code für Tresen und Schaufenster." },
];

const STEPS = [
  { icon: Store, title: "Salon anlegen", text: "Leistungen, Preise, Team und Öffnungszeiten eintragen. Dauert rund zwei Minuten." },
  { icon: Link2, title: "Link teilen", text: "Ins Google-Profil, in die Instagram-Bio und als QR-Code an den Empfang." },
  { icon: CalendarCheck2, title: "Termine kommen rein", text: "Gebucht wird direkt in Ihren Kalender. Sie bekommen eine Mail, die Kundin eine Bestätigung." },
];

const MORE = [
  { icon: CalendarDays, title: "Kalender pro Mitarbeiter", text: "Tag und Woche, Termine per Klick eintragen, verschieben oder absagen." },
  { icon: Layers, title: "Mehrere Leistungen pro Termin", text: "Schnitt und Farbe in einer Buchung. Dauer und Preis werden automatisch zusammengerechnet." },
  { icon: BadgeEuro, title: "Preise je Mitarbeiter", text: "Die Meisterin kostet mehr als die Junior-Stylistin? Pro Person ein eigener Preis." },
  { icon: TreePalm, title: "Feiertage & Urlaub", text: "Feiertage Ihres Bundeslands sind automatisch zu, Urlaub und Sondertage mit zwei Klicks." },
  { icon: BellRing, title: "Push aufs Handy", text: "Jede neue Online-Buchung meldet sich sofort auf den Handys im Team, auch ohne App-Store." },
  { icon: ListPlus, title: "Warteliste", text: "Ausgebucht? Kunden tragen sich ein und bekommen eine Mail, sobald ein Termin frei wird." },
  { icon: Star, title: "Mehr Google-Bewertungen", text: "Am Tag nach dem ersten Besuch kommt eine freundliche Bitte um eine Bewertung." },
  { icon: UsersRound, title: "Kundenkartei", text: "Stammkunden werden erkannt. Besuche, No-Shows, Umsatz und Notizen, Export als Excel." },
  { icon: ShieldCheck, title: "Keine Doppelbuchungen", text: "Die Datenbank sperrt belegte Zeiten, auch wenn zwei gleichzeitig buchen." },
];

const FAQ: [string, string][] = [
  ["Brauchen meine Kunden ein Konto?", "Nein. Kunden wählen Leistung und Uhrzeit, tragen Name und Telefon ein – fertig."],
  ["Wie finden Neukunden meine Buchungsseite?", "Über den Buchungslink im Google-Unternehmensprofil, in der Instagram-Bio, auf Ihrer Webseite und über den QR-Code im Salon."],
  ["Kann ich weiter Termine am Telefon annehmen?", "Ja. Telefon- und Laufkundschaft tragen Sie mit zwei Klicks in denselben Kalender ein."],
  ["Was kostet Trimtable?", "Die ersten 30 Tage sind kostenlos, ohne Kreditkarte. Danach 29 € im Monat, monatlich kündbar, oder 290 € im Jahr (zwei Monate gratis). Keine Provision, keine Umsatzsteuer."],
  ["Kann ich eine Anzahlung verlangen?", "Ja. Sie verbinden Ihr eigenes Stripe-Konto und legen einen Prozentsatz fest. Kunden stimmen vor der Zahlung einer klaren Ausfallregel zu. Bei Absage bis 24 Stunden vorher wird automatisch erstattet."],
  ["Kann ich mit dem Handy Kartenzahlungen annehmen?", "Ja, per QR-Code: Sie tippen den Betrag ein, die Kundin scannt und zahlt mit Apple Pay, Google Pay oder Karte auf ihrem eigenen Handy. Das Geld geht direkt auf Ihr Stripe-Konto. Eine Registrierkasse mit TSE ersetzt das nicht."],
  ["Wie komme ich wieder raus?", "Monatlich kündbar, ohne Mindestlaufzeit. Ihre Kundenkartei laden Sie jederzeit als Excel-Datei herunter."],
  ["Kann ich Gutscheine verkaufen?", "Ja. Kunden kaufen sie online auf Ihrer Buchungsseite, das Geld geht direkt auf Ihr Stripe-Konto. Gutscheine aus dem Salon tragen Sie selbst ein. Eingelöst wird per Code, auch in Teilbeträgen."],
  ["Haben meine Mitarbeiter unterschiedliche Preise?", "Kein Problem. Pro Leistung können Sie für jede Person einen eigenen Preis festlegen. Kunden sehen den passenden Preis, sobald sie jemanden auswählen."],
  ["Was passiert, wenn ich nach dem Test kein Abo abschließe?", "Die Buchungsseite nimmt keine Termine mehr an, Ihre Daten bleiben noch 90 Tage erhalten. Vor der Löschung erinnern wir Sie mehrmals per E-Mail. Mit einem Abo geht es jederzeit nahtlos weiter."],
  ["Wo liegen die Daten?", "In einer Datenbank in Frankfurt am Main. Impressum und Datenschutzerklärung für Ihre Buchungsseite sind vorbereitet."],
];

export default async function Home() {
  const qr = await QRCode.toString("https://trimtable.de/bezahlt", { type: "svg", margin: 1, color: { dark: "#0b1220", light: "#ffffff" } });
  return (
    <div className="overflow-x-clip">
      <JsonLd data={[organizationSchema(), websiteSchema(), softwareSchema(), faqSchema(FAQ)]} />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-[10px] border border-accent/25 bg-accent/10 text-accent">
              <LogoMark size={15} />
            </span>
            Trimtable
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#warum" className="hover:text-fg">Warum Trimtable</a>
            <a href="#funktionen" className="hover:text-fg">Funktionen</a>
            <a href="#rechner" className="hover:text-fg">Rechner</a>
            <a href="#preise" className="hover:text-fg">Preise</a>
            <a href="#faq" className="hover:text-fg">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost btn-sm">Anmelden</Link>
            <Link href="/registrieren" className="btn btn-sm border-accent bg-accent font-semibold text-accent-ink hover:!bg-accent-h">Kostenlos starten</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[520px] max-w-4xl rounded-full bg-accent/10 blur-[120px]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
            <div className="grid gap-7 [animation:rise_.6s_ease-out_both]">
              <span className="flex w-fit items-center gap-2 rounded-full border border-line-2 bg-card/60 px-3 py-1 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-accent" /> Für Friseur- und Beautysalons
              </span>
              <h1 className="text-5xl leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:text-[4.4rem]">
                Online-Termine.
                <br />
                <span className="text-muted">Ohne Provision.</span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted">
                Ihre eigene Buchungsseite, ein Kalender fürs ganze Team, Erinnerungen gegen leere Stühle und Kartenzahlung per QR-Code. Ihre Kunden
                buchen direkt bei Ihnen – nicht über einen Marktplatz, der an jedem Neukunden mitverdient.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/registrieren" className="btn btn-primary">30 Tage kostenlos testen <ArrowRight size={18} /></Link>
                <a href="#funktionen" className="btn h-[52px] rounded-[14px] px-5">So funktioniert’s</a>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                {["Keine Kreditkarte nötig", "In 2 Minuten eingerichtet", "Daten in Frankfurt"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check size={16} className="text-accent" /> {t}</li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto w-full max-w-[560px] [animation:rise_.8s_.1s_ease-out_both]">
              <CalendarPreview />
              <div className="absolute -right-2 -bottom-24 hidden scale-[0.72] origin-bottom-right sm:block lg:-right-10">
                <PhoneBooking />
              </div>
            </div>
          </div>
        </section>

        {/* Facts */}
        <section className="border-y border-line">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-4">
            {[["0 %", "Provision auf Buchungen"], ["24/7", "online buchbar"], ["2 Min.", "bis zur eigenen Buchungsseite"], ["29 €", "im Monat, ganzes Team"]].map(([v, l]) => (
              <div key={l} className="grid gap-1 py-8">
                <dt className="order-2 text-sm text-muted">{l}</dt>
                <dd className="text-3xl font-semibold tracking-tight tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Problems */}
        <section id="warum" className="scroll-mt-16 bg-card-2/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-24 sm:px-6">
            <div className="grid max-w-2xl gap-3">
              <span className="label">Was Salons an Buchungsplattformen stört</span>
              <h2 className="text-3xl font-semibold sm:text-4xl">Die häufigsten Klagen. Und was wir anders machen.</h2>
              <p className="text-muted">Zusammengetragen aus Fachpresse, Bewertungsportalen und Salon-Foren.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PROBLEMS.map(({ icon: Icon, pain, fix }) => (
                <div key={pain} className="card grid content-start gap-4 p-6">
                  <span className="grid size-10 place-items-center rounded-xl border border-line-2 bg-card-2 text-muted"><Icon size={18} strokeWidth={1.75} /></span>
                  <p className="font-medium leading-snug">{pain}</p>
                  <p className="flex gap-2.5 border-t border-line pt-4 text-sm leading-relaxed text-muted">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent" /> {fix}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-24 sm:px-6">
          <div className="grid max-w-2xl gap-3">
            <span className="label">In drei Schritten</span>
            <h2 className="text-3xl font-semibold sm:text-4xl">Heute anlegen, heute Termine bekommen.</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="card relative grid content-start gap-3 p-6">
                <span className="absolute top-5 right-5 font-mono text-sm text-dim">0{i + 1}</span>
                <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><Icon size={18} strokeWidth={1.75} /></span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Feature showcase */}
        <section id="funktionen" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-28 px-4 py-24 sm:px-6">
            <Showcase
              label="Buchungsseite"
              title="Ihr Salon, rund um die Uhr buchbar."
              text="Eine eigene Seite mit Ihrem Namen, Ihren Leistungen und Preisen. Kunden sehen nur echte freie Zeiten, buchen in unter einer Minute und brauchen kein Konto."
              points={["Freie Zeiten pro Mitarbeiter oder „egal, wer frei ist“", "Mehrere Leistungen in einer Buchung, z. B. Schnitt und Farbe", "Bestätigung mit Absage-Link per E-Mail", "Link und QR-Code für Google, Instagram und Tresen"]}
              visual={<PhoneBooking />}
            />
            <Showcase
              reverse
              label="Weniger No-Shows"
              title="Der Stuhl bleibt nicht leer."
              text="Am Vortag kommt automatisch eine Erinnerung. Wer nicht kann, sagt mit einem Klick ab und der Termin ist sofort wieder buchbar. Auf Wunsch zahlen Kunden einen Teil vorab."
              points={["Erinnerung am Vortag, ohne Zutun", "Anzahlung in Prozent, direkt auf Ihr Stripe-Konto", "Klare Ausfallregel, der Kunden vor der Zahlung zustimmen"]}
              visual={<ReminderStack />}
            />
            <Showcase
              label="Kassieren"
              title="Kartenzahlung ohne Kartenterminal."
              text="Betrag eintippen, QR-Code zeigen. Die Kundin scannt mit ihrem Handy und zahlt mit Apple Pay, Google Pay oder Karte. Das Geld geht direkt auf Ihr Konto."
              points={["Kein Gerät, keine Miete, keine Vertragsbindung", "Zahlungsstatus live, Tagesübersicht inklusive", "Beleg per E-Mail von Stripe"]}
              visual={
                <div className="relative flex items-end justify-center gap-4">
                  <CounterCard qr={qr} />
                  <div className="-ml-16 hidden translate-y-8 scale-[0.8] origin-bottom sm:block"><PhonePay /></div>
                </div>
              }
            />
            <Showcase
              reverse
              label="Gutscheine"
              title="Geschenke verkaufen, während Sie schneiden."
              text="Kunden kaufen Gutscheine direkt auf Ihrer Buchungsseite, bezahlen online und bekommen sie sofort per Mail zum Ausdrucken. Im Salon prüfen und lösen Sie mit dem Code ein, auch in Teilbeträgen."
              points={["Geld kommt direkt auf Ihr Stripe-Konto", "Restwert wird automatisch mitgeführt", "Auch für Gutscheine, die Sie im Salon bar verkaufen"]}
              visual={<VoucherStack />}
            />
            <Showcase
              label="Auswertung"
              title="Wissen, was läuft. Ohne Excel."
              text="Umsatz, Termine, neue Kunden und Ausfälle im Vergleich zum Vormonat. Dazu die Auslastung je Mitarbeiter, die beliebtesten Leistungen und die stärksten Wochentage."
              points={["Woche, Monat, Quartal oder Jahr", "Erzielter und bereits gebuchter Umsatz", "Auslastung aus Ihren echten Öffnungszeiten"]}
              visual={<StatsPreview />}
            />
          </div>
        </section>

        {/* More features */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 sm:px-6">
          <h2 className="text-2xl font-semibold sm:text-3xl">Und alles, was der Empfang sonst braucht.</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MORE.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 rounded-[18px] border border-line p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-2 bg-card-2 text-accent"><Icon size={18} strokeWidth={1.75} /></span>
                <div className="grid gap-1">
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Calculator */}
        <section id="rechner" className="scroll-mt-16 border-y border-line bg-card-2/60">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid content-start gap-4">
              <span className="label">Rechner</span>
              <h2 className="text-3xl font-semibold sm:text-4xl">Was die Provision Sie im Jahr kostet.</h2>
              <p className="text-muted">
                Marktplätze verdienen an jedem Neukunden mit, oft auch dann, wenn die Kundin Sie selbst über Google gefunden hat. Schieben Sie die Regler auf
                Ihre Zahlen.
              </p>
              <ul className="grid gap-2 text-sm text-muted">
                {["Kein Marktplatz neben der Konkurrenz", "Kundendaten gehören Ihnen", "Fester Preis statt Provision"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check size={16} className="text-accent" /> {t}</li>
                ))}
              </ul>
            </div>
            <SavingsCalculator />
          </div>
        </section>

        {/* Pricing */}
        <section id="preise" className="scroll-mt-16 mx-auto grid max-w-6xl justify-items-center gap-10 px-4 py-24 sm:px-6">
          <div className="grid max-w-2xl justify-items-center gap-3 text-center">
            <span className="label">Preise</span>
            <h2 className="text-3xl font-semibold sm:text-4xl">Ein Preis. Alles drin.</h2>
            <p className="text-muted">30 Tage kostenlos testen. Danach monatlich kündbar, oder jährlich zahlen und zwei Monate sparen.</p>
          </div>
          <PricingCard />
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 mx-auto grid max-w-3xl gap-8 px-4 pb-24 sm:px-6">
          <h2 className="text-3xl font-semibold sm:text-4xl">Häufige Fragen</h2>
          <div className="grid gap-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span className="text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Name */}
        <section className="px-4 pb-24 sm:px-6">
          <figure className="mx-auto grid max-w-4xl items-center gap-10 rounded-[28px] border border-line bg-card-2/60 p-8 sm:p-12 md:grid-cols-[auto_1fr]">
            <div className="grid justify-items-center gap-4">
              <div aria-hidden className="grid grid-cols-3 gap-2.5">
                {Array.from({ length: 9 }, (_, i) => (
                  <span
                    key={i}
                    className={`size-11 rounded-[12px] sm:size-14 ${i === 5 ? "bg-fg" : i === 6 ? "bg-accent/35" : "bg-accent"}`}
                  />
                ))}
              </div>
              <div className="flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-accent" /> frei</span>
                <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-fg" /> gebucht</span>
                <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-accent/35" /> vorbei</span>
              </div>
            </div>
            <div className="grid gap-4">
              <span className="label">Warum Trimtable?</span>
              <blockquote className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                <span className="text-accent">Trim</span> + <span className="text-accent">Timetable</span>.
              </blockquote>
              <figcaption className="grid gap-3 text-muted">
                <p>
                  <span className="text-fg">Trim</span> heißt schneiden, in Form bringen. <span className="text-fg">Timetable</span> ist der Stundenplan. Zusammen
                  ergibt das Ihr Terminbuch, das sich von selbst füllt, während Sie schneiden.
                </p>
                <p>Das Logo ist genau dieser Stundenplan: neun Zeitfenster, eins gebucht, eins schon vorbei. Und ja, wir kommen aus Mannheim, der Stadt, die seit 1607 in Quadraten plant.</p>
              </figcaption>
            </div>
          </figure>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="relative mx-auto grid max-w-6xl justify-items-center gap-6 overflow-hidden rounded-[28px] border border-line bg-card px-6 py-16 text-center">
            <div aria-hidden className="pointer-events-none absolute -top-32 h-72 w-[680px] max-w-full rounded-full bg-accent/15 blur-[100px]" />
            <h2 className="relative max-w-2xl text-3xl font-semibold sm:text-4xl">Ihr nächster Neukunde gehört Ihnen. Zu 100 %.</h2>
            <p className="relative max-w-xl text-muted">Salon in zwei Minuten anlegen, Link teilen, Termine bekommen. 30 Tage kostenlos, keine Kreditkarte.</p>
            <Link href="/registrieren" className="btn btn-primary relative">Jetzt Salon anlegen <ArrowRight size={18} /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="grid content-start gap-3">
            <span className="flex items-center gap-2 font-semibold"><LogoMark size={15} className="text-accent" /> Trimtable</span>
            <p className="max-w-xs text-muted"><span className="text-fg">{SLOGAN}</span> Online-Termine, Kalender und Kartenzahlung für Friseursalons.</p>
          </div>
          <div className="grid content-start gap-2 text-muted">
            <span className="label mb-1">Produkt</span>
            <a href="#funktionen" className="hover:text-fg">Funktionen</a>
            <a href="#preise" className="hover:text-fg">Preise</a>
            <Link href="/registrieren" className="hover:text-fg">Registrieren</Link>
            <Link href="/login" className="hover:text-fg">Anmelden</Link>
          </div>
          <div className="grid content-start gap-2 text-muted">
            <span className="label mb-1">Rechtliches</span>
            <Link href="/impressum" className="hover:text-fg">Impressum</Link>
            <Link href="/datenschutz" className="hover:text-fg">Datenschutz</Link>
            <Link href="/agb" className="hover:text-fg">AGB</Link>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 border-t border-line px-4 py-5 text-xs text-dim sm:px-6">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>© {new Date().getFullYear()} Trimtable</span>
            <MadeInMannheim />
          </span>
          <span className="flex items-center gap-2">Darstellung <ThemeToggle className="icon-btn !size-8" /></span>
        </div>
      </footer>
    </div>
  );
}

function Showcase(p: { label: string; title: string; text: string; points: string[]; visual: React.ReactNode; reverse?: boolean }) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <div className={`grid content-start gap-5 ${p.reverse ? "lg:order-2" : ""}`}>
        <span className="label">{p.label}</span>
        <h2 className="text-3xl font-semibold sm:text-4xl">{p.title}</h2>
        <p className="text-lg leading-relaxed text-muted">{p.text}</p>
        <ul className="grid gap-2.5">
          {p.points.map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-sm"><Check size={16} className="mt-0.5 shrink-0 text-accent" /> {t}</li>
          ))}
        </ul>
      </div>
      <div className="relative flex justify-center">
        <div aria-hidden className="pointer-events-none absolute inset-10 rounded-full bg-accent/10 blur-[80px]" />
        <div className="relative">{p.visual}</div>
      </div>
    </div>
  );
}

/** Static product preview of the day calendar. */
function CalendarPreview() {
  const lanes: { name: string; blocks: { top: number; h: number; t: string; n: string; tone: string }[] }[] = [
    { name: "Anna", blocks: [
      { top: 8, h: 58, t: "09:00", n: "Laura M.", tone: "border-slate-400/30 bg-slate-400/12" },
      { top: 74, h: 28, t: "10:00", n: "Tim R.", tone: "border-accent/35 bg-accent/14" },
      { top: 170, h: 86, t: "12:00", n: "Sabine W.", tone: "border-accent/35 bg-accent/14" },
    ] },
    { name: "Marco", blocks: [
      { top: 40, h: 42, t: "09:30", n: "Deniz Y.", tone: "border-accent/35 bg-accent/14" },
      { top: 120, h: 28, t: "11:00", n: "Mia S.", tone: "border-danger/40 bg-danger/12" },
      { top: 200, h: 58, t: "12:30", n: "Online-Buchung", tone: "border-accent/35 bg-accent/14" },
    ] },
  ];
  return (
    <div aria-hidden className="relative [animation:rise_.8s_.1s_ease-out_both]">
      <div className="card overflow-hidden bg-card/80 backdrop-blur">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Heute</div>
            <div className="font-semibold">Dienstag, 27. Oktober</div>
          </div>
          <div className="flex gap-2 font-mono text-xs">
            <span className="rounded-lg border border-line px-2 py-1 text-muted">6 Termine</span>
            <span className="rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-accent">412 €</span>
          </div>
        </div>
        <div className="grid grid-cols-[44px_1fr_1fr]">
          <div className="relative h-[280px] border-r border-line font-mono text-[10px] text-dim">
            {["09", "10", "11", "12", "13"].map((h, i) => (
              <span key={h} className="absolute right-2" style={{ top: i * 60 + 2 }}>{h}:00</span>
            ))}
          </div>
          {lanes.map((l, i) => (
            <div key={l.name} className={`relative h-[280px] ${i ? "border-l border-line" : ""}`} style={{ background: "linear-gradient(var(--color-line) 1px, transparent 1px) 0 0 / 100% 60px" }}>
              <span className="absolute top-1 right-2 text-[10px] text-dim">{l.name}</span>
              {l.blocks.map((b) => (
                <div key={b.t} className={`absolute inset-x-1.5 rounded-[9px] border px-2 py-1 ${b.tone}`} style={{ top: b.top, height: b.h }}>
                  <div className="font-mono text-[10px] text-accent">{b.t}</div>
                  <div className="truncate text-xs font-semibold">{b.n}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="card absolute -bottom-6 -left-4 hidden items-center gap-3 px-4 py-3 shadow-2xl sm:flex">
        <span className="grid size-9 place-items-center rounded-xl bg-accent/12 text-accent"><BellRing size={16} /></span>
        <div className="text-sm">
          <div className="font-medium">Neue Online-Buchung</div>
          <div className="text-xs text-muted">Herren · Schneiden & Bart, 14:30</div>
        </div>
      </div>
    </div>
  );
}
