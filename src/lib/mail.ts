import "server-only";
import nodemailer from "nodemailer";
import { euro, fullDateTime } from "./time";
import { esc, mailLayout, type MailParts } from "./mail-layout";
import { publicClient } from "./supabase";
import { OPERATOR } from "./operator";

/**
 * Sending: Resend with the verified domain boxentakt.de when RESEND_API_KEY is set (SPF/DKIM, far less spam),
 * otherwise Gmail via app password (SMTP_USER/SMTP_PASS). Without either, mails are skipped.
 */
const resendKey = process.env.RESEND_API_KEY;
const smtpEnabled = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
export const mailEnabled = () => Boolean(resendKey || smtpEnabled);
const transport = !resendKey && smtpEnabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

export const appUrl = () =>
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

type Mail = { html: string; text: string };
const salon = (name: string, logo?: string | null): MailParts["brand"] => ({ kind: "salon", name, logo });
const platform: MailParts["brand"] = { kind: "platform" };
/** Betrieb logo by booking-page slug, cached for a few minutes (cron runs send many mails per salon). */
const logoCache = new Map<string, { at: number; logo: Promise<string | null> }>();
function logoFor(slug: string) {
  const hit = logoCache.get(slug);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.logo;
  const logo = Promise.resolve(publicClient().rpc("public_salon", { p_slug: slug }))
    .then(({ data }) => (data as { logo_url?: string | null } | null)?.logo_url ?? null)
    .catch(() => null);
  logoCache.set(slug, { at: Date.now(), logo });
  return logo;
}

const link = (url: string, label = url) => `<a href="${esc(url)}" style="color:#047857">${esc(label)}</a>`;

async function send(to: string, subject: string, mail: Mail, fromName: string, replyTo?: string) {
  const name = fromName.replace(/["<>]/g, "");
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `"${name}" <${process.env.MAIL_FROM || "termine@boxentakt.de"}>`,
        to: [to],
        subject,
        html: mail.html,
        // plain-text part: HTML-only mails score worse with spam filters
        text: mail.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
    return { skipped: false };
  }
  if (!transport) return { skipped: true };
  await transport.sendMail({ from: `"${name}" <${process.env.SMTP_USER}>`, to, subject, html: mail.html, text: mail.text, replyTo });
  return { skipped: false };
}

export type Booked = {
  cancel_token: string;
  salon_name: string;
  salon_address: string | null;
  salon_phone: string | null;
  owner_email: string;
  timezone: string;
  staff_name: string;
  service_name: string;
  price_cents: number;
  starts_at: string;
  ends_at?: string;
  salon_slug?: string;
  salon_logo?: string | null;
  /** paid deposit (Anzahlung) in cents, if any */
  deposit_cents?: number | null;
  license_plate?: string | null;
};

const contact = (address: string | null, phone: string | null) =>
  [address && esc(address), phone && `Tel. ${link(`tel:${phone.replace(/[^\d+]/g, "")}`, phone)}`].filter(Boolean).join("<br>");

export async function sendBookingMails(b: Booked, customer: { name: string; email?: string; phone: string; note?: string }) {
  const when = fullDateTime(b.starts_at, b.timezone);
  const cancelUrl = `${appUrl()}/storno/${b.cancel_token}`;
  const rows: [string, string][] = [
    ["Termin", when],
    ...(b.license_plate ? [["Kennzeichen", b.license_plate] as [string, string]] : []),
    ["Leistung", b.service_name],
    ["Bei", b.staff_name],
    ["Preis", euro(b.price_cents)],
    ...(b.deposit_cents ? [["Anzahlung bezahlt", euro(b.deposit_cents)] as [string, string]] : []),
  ];
  const jobs: Promise<unknown>[] = [];
  if (customer.email) {
    const refund = b.deposit_cents
      ? "<br><br>Bei Absage bis 24 Stunden vorher wird die Anzahlung automatisch erstattet. Bei späterer Absage oder Nichterscheinen behält der Betrieb sie als Ausfallpauschale (Nachweis eines geringeren Schadens bleibt vorbehalten)."
      : "";
    jobs.push(
      send(
        customer.email,
        `Terminbestätigung – ${b.salon_name}`,
        mailLayout({
          brand: salon(b.salon_name, b.salon_logo),
          preheader: `${when} · ${b.service_name}`,
          title: "Ihr Termin ist gebucht",
          intro: `Hallo ${esc(customer.name.split(/\s+/)[0])}, wir freuen uns auf Sie.`,
          rows,
          body: contact(b.salon_address, b.salon_phone) || undefined,
          note: `Doch keine Zeit? Bis 2 Stunden vorher ${link(cancelUrl, "verschieben oder absagen")}.${refund}`,
        }),
        b.salon_name,
        b.owner_email,
      ),
    );
  }
  jobs.push(
    send(
      b.owner_email,
      `Neue Online-Buchung: ${customer.name}, ${when}`,
      mailLayout({
        brand: platform,
        preheader: `${customer.name} · ${b.service_name} · ${when}`,
        title: "Neue Online-Buchung",
        rows: [
          ["Kunde", customer.name],
          ["Telefon", customer.phone],
          ...(customer.email ? [["E-Mail", customer.email] as [string, string]] : []),
          ...rows,
          ...(customer.note ? [["Hinweis", customer.note] as [string, string]] : []),
        ],
        button: { label: "Im Kalender ansehen", url: `${appUrl()}/dashboard` },
      }),
      "Boxentakt",
    ),
  );
  const res = await Promise.allSettled(jobs);
  res.forEach((r) => r.status === "rejected" && console.error("mail failed", r.reason));
}

export async function sendReminder(r: {
  email: string;
  customer_name: string;
  service_name: string;
  starts_at: string;
  staff_name: string;
  salon_name: string;
  salon_phone: string | null;
  timezone: string;
  cancel_token: string;
  salon_logo?: string | null;
}) {
  const when = fullDateTime(r.starts_at, r.timezone);
  return send(
    r.email,
    `Erinnerung: Ihr Termin morgen bei ${r.salon_name}`,
    mailLayout({
      brand: salon(r.salon_name, r.salon_logo),
      preheader: `Morgen: ${when}`,
      title: `Bis morgen, ${r.customer_name.split(/\s+/)[0]}!`,
      rows: [["Termin", when], ["Leistung", r.service_name], ["Bei", r.staff_name]],
      body: r.salon_phone ? `Fragen? ${contact(null, r.salon_phone)}` : undefined,
      note: `Doch keine Zeit? Bitte rechtzeitig ${link(`${appUrl()}/storno/${r.cancel_token}`, "verschieben oder absagen")}, dann kann jemand anderes den Termin nutzen.`,
    }),
    r.salon_name,
  );
}

export async function sendCustomerUpdate(u: {
  kind: "cancelled" | "moved";
  email: string;
  customer_name: string;
  service_name: string;
  starts_at: string;
  staff_name: string;
  salon_name: string;
  salon_phone: string | null;
  salon_slug: string;
  timezone: string;
  cancel_token: string;
  reply_to: string;
  salon_logo?: string | null;
}) {
  const when = fullDateTime(u.starts_at, u.timezone);
  const call = u.salon_phone ? `Fragen? ${contact(null, u.salon_phone)}` : undefined;
  if (u.kind === "cancelled") {
    return send(
      u.email,
      `Ihr Termin bei ${u.salon_name} wurde abgesagt`,
      mailLayout({
        brand: salon(u.salon_name, u.salon_logo),
        title: "Termin abgesagt",
        intro: "Leider müssen wir diesen Termin absagen. Bitte entschuldigen Sie die Umstände.",
        rows: [["Termin", when], ["Leistung", u.service_name]],
        button: { label: "Neuen Termin buchen", url: `${appUrl()}/${u.salon_slug}` },
        body: call,
      }),
      u.salon_name,
      u.reply_to,
    );
  }
  return send(
    u.email,
    `Neue Uhrzeit für Ihren Termin bei ${u.salon_name}`,
    mailLayout({
      brand: salon(u.salon_name, u.salon_logo),
      title: "Ihr Termin wurde verschoben",
      rows: [["Neuer Termin", when], ["Leistung", u.service_name], ["Bei", u.staff_name]],
      body: call,
      note: `Passt die neue Zeit nicht? ${link(`${appUrl()}/storno/${u.cancel_token}`, "Termin verschieben oder absagen")}`,
    }),
    u.salon_name,
    u.reply_to,
  );
}

export async function sendInvite(to: string, salonName: string, invitedBy: string) {
  return send(
    to,
    `Einladung: Kalender von ${salonName}`,
    mailLayout({
      brand: platform,
      title: `Du wurdest zu ${salonName} eingeladen`,
      intro: `${esc(invitedBy)} möchte den Kalender von ${esc(salonName)} mit dir teilen.`,
      button: { label: "Konto anlegen", url: `${appUrl()}/login` },
      body: "Lege das Konto mit genau dieser E-Mail-Adresse an („Noch kein Konto?“). Nach der Bestätigung siehst du den Kalender des Betriebs.",
    }),
    "Boxentakt",
    invitedBy,
  );
}

export type Followup = {
  kind: "review" | "rebook";
  email: string;
  customer_name: string;
  salon_name: string;
  salon_slug: string;
  salon_phone: string | null;
  reply_to: string;
  service_name: string;
  review_url: string | null;
  unsubscribe_token: string;
  weeks: number | null;
};

/** Review request the day after, or "time for the next appointment" after the service's interval. Both carry an unsubscribe link. */
export async function sendFollowup(f: Followup) {
  const logo = await logoFor(f.salon_slug);
  const first = f.customer_name.split(/\s+/)[0];
  const note = `Sie bekommen diese Mail als Kunde von ${esc(f.salon_name)}. Keine solchen Mails mehr: ${link(`${appUrl()}/abmelden/${f.unsubscribe_token}`, "abmelden")}`;
  if (f.kind === "review" && f.review_url) {
    return send(
      f.email,
      `Wie war Ihr Termin bei ${f.salon_name}?`,
      mailLayout({
        brand: salon(f.salon_name, logo),
        title: `Danke für Ihren Besuch, ${first}!`,
        intro: "Wir hoffen, Sie sind zufrieden. Eine kurze Bewertung bei Google hilft uns sehr, es dauert nur eine Minute.",
        rows: [["Leistung", f.service_name]],
        button: { label: "Jetzt bewerten", url: f.review_url },
        note,
      }),
      f.salon_name,
      f.reply_to,
    );
  }
  return send(
    f.email,
    `Zeit für den nächsten Termin bei ${f.salon_name}?`,
    mailLayout({
      brand: salon(f.salon_name, logo),
      title: `Hallo ${first}, Zeit für Ihren nächsten Termin?`,
      intro: "Freie Zeiten sehen und direkt online buchen.",
      rows: [["Zuletzt", f.service_name], ...(f.weeks ? [["Vor", `${f.weeks} Wochen`] as [string, string]] : [])],
      button: { label: "Termin buchen", url: `${appUrl()}/${f.salon_slug}` },
      body: f.salon_phone ? `Oder anrufen: ${contact(null, f.salon_phone)}` : undefined,
      note,
    }),
    f.salon_name,
    f.reply_to,
  );
}

export type WaitlistHit = {
  email: string;
  name: string;
  day: string;
  salon_name: string;
  salon_slug: string;
  salon_phone: string | null;
  reply_to: string;
  service_id: string | null;
  service_name: string | null;
};

/** A slot opened up on a day the customer was waiting for. First come, first served. */
export async function sendWaitlistOpening(w: WaitlistHit) {
  const logo = await logoFor(w.salon_slug);
  const dayLabel = new Date(`${w.day}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const q = new URLSearchParams({ tag: w.day, ...(w.service_id ? { leistung: w.service_id } : {}) });
  return send(
    w.email,
    `Termin frei: ${dayLabel} bei ${w.salon_name}`,
    mailLayout({
      brand: salon(w.salon_name, logo),
      preheader: "Ein Termin ist frei geworden – wer zuerst bucht, bekommt ihn.",
      title: `Gute Nachricht, ${w.name.split(/\s+/)[0]}!`,
      intro: "Für den Tag, auf den Sie gewartet haben, ist gerade ein Termin frei geworden. Wer zuerst bucht, bekommt ihn.",
      rows: [["Tag", dayLabel], ...(w.service_name ? [["Leistung", w.service_name] as [string, string]] : [])],
      button: { label: "Freie Zeiten ansehen", url: `${appUrl()}/${w.salon_slug}?${q}` },
      note: "Ihr Eintrag auf der Warteliste ist damit erledigt.",
    }),
    w.salon_name,
    w.reply_to,
  );
}

const FEEDBACK_KIND = { idee: "Idee", problem: "Problem", lob: "Lob" } as const;

/** Feedback from a salon to the platform operator; replies go straight to the sender. */
export async function sendFeedback(f: { to: string; kind: keyof typeof FEEDBACK_KIND; message: string; from: string; salon: string | null; page: string | null }) {
  return send(
    f.to,
    `Feedback (${FEEDBACK_KIND[f.kind]}): ${f.salon ?? f.from}`,
    mailLayout({
      brand: platform,
      title: `${FEEDBACK_KIND[f.kind]} von ${f.salon ?? f.from}`,
      rows: [["Von", f.from], ["Betrieb", f.salon ?? "–"], ["Seite", f.page ?? "–"]],
      body: `<div style="white-space:pre-wrap">${esc(f.message)}</div>`,
    }),
    "Boxentakt Feedback",
    f.from,
  );
}

export type VoucherPaid = {
  code: string;
  token: string;
  amount_cents: number;
  valid_until: string;
  buyer_name: string;
  buyer_email: string;
  recipient_name: string | null;
  message: string | null;
  salon_name: string;
  salon_slug: string;
  salon_logo: string | null;
  salon_address: string | null;
  salon_phone: string | null;
  owner_email: string;
  reply_to: string;
};

const deDate = (d: string) => `${Number(d.slice(8))}.${Number(d.slice(5, 7))}.${d.slice(0, 4)}`;

/** Voucher to the buyer (with print link) and a short note to the salon. */
export async function sendVoucherMails(v: VoucherPaid) {
  const url = `${appUrl()}/gutschein/${v.token}`;
  const rows: [string, string][] = [
    ["Wert", euro(v.amount_cents)],
    ["Code", v.code],
    ...(v.recipient_name ? [["Für", v.recipient_name] as [string, string]] : []),
    ["Gültig bis", deDate(v.valid_until)],
  ];
  const res = await Promise.allSettled([
    send(
      v.buyer_email,
      `Ihr Gutschein für ${v.salon_name}`,
      mailLayout({
        brand: salon(v.salon_name, v.salon_logo),
        preheader: `Gutschein über ${euro(v.amount_cents)} – zum Ausdrucken oder Weiterleiten`,
        title: "Danke, Ihr Gutschein ist da",
        intro: `Hallo ${esc(v.buyer_name.split(/\s+/)[0])}, hier ist Ihr Gutschein. Sie können ihn ausdrucken oder den Link einfach weiterschicken.`,
        rows,
        button: { label: "Gutschein ansehen und drucken", url },
        body: contact(v.salon_address, v.salon_phone) || undefined,
        note: "Einlösbar im Betrieb, auch in Teilbeträgen. Bitte den Code beim Bezahlen nennen.",
      }),
      v.salon_name,
      v.reply_to,
    ),
    send(
      v.owner_email,
      `Gutschein verkauft: ${euro(v.amount_cents)}`,
      mailLayout({
        brand: platform,
        title: "Gutschein online verkauft",
        rows: [["Wert", euro(v.amount_cents)], ["Code", v.code], ["Käufer", `${v.buyer_name} (${v.buyer_email})`], ...(v.recipient_name ? [["Für", v.recipient_name] as [string, string]] : [])],
        button: { label: "Gutscheine ansehen", url: `${appUrl()}/dashboard/kassieren` },
        body: "Das Geld geht wie bei Anzahlungen direkt auf dein Stripe-Konto.",
      }),
      "Boxentakt",
    ),
  ]);
  res.forEach((r) => r.status === "rejected" && console.error("voucher mail failed", r.reason));
}

export type DeletionNotice = { stage: 1 | 2 | 3 | 4 | 5; to: string[]; salon_name: string; salon_slug: string; delete_after: string };

/**
 * Inactive salon (no trial, no subscription): reminders before the automatic deletion – right away, 30, 7 and 1 day before –
 * and a confirmation afterwards (stage 5). A new subscription stops it.
 */
export async function sendDeletionNotice(d: DeletionNotice) {
  const day = new Date(d.delete_after).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
  const keep = "Mit einem Abo bleibt alles erhalten und die Buchungsseite nimmt sofort wieder Termine an. Vorher kannst du die Kundenkartei unter Kunden als Excel-Datei herunterladen.";
  const mail =
    d.stage === 5
      ? {
          subject: `${d.salon_name} wurde gelöscht`,
          parts: {
            title: "Dein Betrieb wurde gelöscht",
            intro: `Wie angekündigt haben wir ${esc(d.salon_name)} mit allen Terminen, Kunden, Einstellungen und Logins gelöscht. Rechnungen bleiben wegen der gesetzlichen Aufbewahrungspflicht bei Stripe gespeichert.`,
            button: { label: "Neu starten", url: `${appUrl()}/registrieren` },
            body: "Danke, dass du Boxentakt ausprobiert hast. Wenn du uns sagen magst, was gefehlt hat, antworte einfach auf diese Mail.",
          },
        }
      : {
          subject:
            d.stage === 4
              ? `Morgen wird ${d.salon_name} gelöscht`
              : d.stage === 1
                ? `${d.salon_name}: Online-Buchung pausiert`
                : `${d.salon_name} wird am ${day} gelöscht`,
          parts: {
            title: d.stage === 4 ? "Letzte Erinnerung: morgen wird gelöscht" : d.stage === 1 ? "Dein Zugang ist abgelaufen" : "Dein Betrieb wird bald gelöscht",
            intro:
              d.stage === 1
                ? `Die Testphase bzw. das Abo von ${esc(d.salon_name)} ist beendet, die Buchungsseite nimmt keine Termine mehr an. Deine Daten bewahren wir noch bis zum ${day} auf, danach löschen wir sie.`
                : `Ohne aktives Abo löschen wir ${esc(d.salon_name)} am ${day} – mit allen Terminen, Kunden, Einstellungen und Logins. Das lässt sich nicht rückgängig machen.`,
            rows: [["Betrieb", d.salon_name], ["Löschung am", day]] as [string, string][],
            button: { label: "Abo abschließen", url: `${appUrl()}/dashboard/leistungen#abo` },
            body: keep,
            note: "Du möchtest nicht warten? Antworte auf diese Mail, dann löschen wir sofort.",
          },
        };
  const html = mailLayout({ brand: platform, preheader: mail.parts.title, ...mail.parts });
  await Promise.all(d.to.map((to) => send(to, mail.subject, html, "Boxentakt", OPERATOR.email)));
}

/** Monthly report to the operator: rows grouped into sections, values with the previous month in brackets. */
export async function sendReport(r: { to: string; month: string; sections: { title: string; rows: [string, string][] }[]; note?: string }) {
  const table = (rows: [string, string][]) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0">${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid #E5E7EB;font-size:14px;color:#64748B">${esc(k)}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #E5E7EB;font-size:14px;color:#0B1220;font-weight:500;font-variant-numeric:tabular-nums">${esc(v)}</td></tr>`,
      )
      .join("")}</table>`;
  const body = r.sections.map((s) => `<div style="margin:20px 0 0;font-weight:600;color:#0B1220">${esc(s.title)}</div>${table(s.rows)}`).join("");
  return send(
    r.to,
    `Boxentakt – Monatsbericht ${r.month}`,
    mailLayout({
      brand: platform,
      preheader: r.sections[0]?.rows.map(([k, v]) => `${k} ${v}`).join(" · "),
      title: `Monatsbericht ${r.month}`,
      intro: "Die wichtigsten Zahlen des letzten Monats, in Klammern der Vormonat.",
      body,
      note: r.note,
    }),
    "Boxentakt",
  );
}

export type Rescheduled = {
  cancel_token: string;
  old_start: string;
  starts_at: string;
  service_name: string;
  staff_name: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  salon_name: string;
  salon_slug: string;
  salon_phone: string | null;
  salon_logo: string | null;
  owner_email: string;
  timezone: string;
};

/** Customer moved the appointment via the link: confirmation to the customer, note to the salon. */
export async function sendRescheduleMails(r: Rescheduled) {
  const when = fullDateTime(r.starts_at, r.timezone);
  const jobs: Promise<unknown>[] = [
    send(
      r.owner_email,
      `Termin verschoben: ${r.customer_name}, ${when}`,
      mailLayout({
        brand: platform,
        preheader: `${r.customer_name} hat den Termin selbst verschoben`,
        title: "Termin verschoben",
        intro: `${esc(r.customer_name)} hat den Termin über den Link in der Bestätigung verschoben.`,
        rows: [
          ["Neu", when],
          ["Vorher", fullDateTime(r.old_start, r.timezone)],
          ["Leistung", r.service_name],
          ["Bei", r.staff_name],
          ["Telefon", r.customer_phone],
        ],
        button: { label: "Im Kalender ansehen", url: `${appUrl()}/dashboard` },
      }),
      "Boxentakt",
    ),
  ];
  if (r.customer_email) {
    jobs.push(
      sendCustomerUpdate({
        kind: "moved",
        email: r.customer_email,
        customer_name: r.customer_name,
        service_name: r.service_name,
        starts_at: r.starts_at,
        staff_name: r.staff_name,
        salon_name: r.salon_name,
        salon_phone: r.salon_phone,
        salon_slug: r.salon_slug,
        timezone: r.timezone,
        cancel_token: r.cancel_token,
        reply_to: r.owner_email,
        salon_logo: r.salon_logo,
      }),
    );
  }
  const res = await Promise.allSettled(jobs);
  res.forEach((x) => x.status === "rejected" && console.error("mail failed", x.reason));
}
