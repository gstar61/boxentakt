// German Supabase auth mails in the Boxentakt design. Usage: node scripts/auth-templates.ts > auth-templates.json
// then PATCH the JSON to https://api.supabase.com/v1/projects/<ref>/config/auth (Management API).
import { mailLayout } from "../src/lib/mail-layout.ts";

const url = "{{ .ConfirmationURL }}";
const squash = (html: string) => html.replace(/\n\s*/g, " ").replace(/>\s+</g, "><");
const tpl = (subject: string, parts: Omit<Parameters<typeof mailLayout>[0], "brand">) => ({ subject, html: squash(mailLayout({ brand: { kind: "platform" }, ...parts }).html) });

const mails = {
  recovery: tpl("Passwort zurücksetzen – Boxentakt", {
    preheader: "Lege mit einem Klick ein neues Passwort fest.",
    title: "Neues Passwort festlegen",
    intro: "Jemand – hoffentlich du – möchte das Passwort für dein Boxentakt-Konto zurücksetzen.",
    button: { label: "Neues Passwort festlegen", url },
    body: "Der Link gilt eine Stunde und funktioniert nur einmal.",
    note: "Du hast das nicht angefordert? Dann ignoriere diese Mail einfach, dein Passwort bleibt unverändert.",
  }),
  confirmation: tpl("Bitte bestätige deine E-Mail-Adresse – Boxentakt", {
    preheader: "Ein Klick, dann kann es losgehen.",
    title: "Willkommen bei Boxentakt",
    intro: "Bitte bestätige noch deine E-Mail-Adresse. Danach meldest du dich an und richtest deinen Salon ein – das dauert etwa zwei Minuten.",
    button: { label: "E-Mail-Adresse bestätigen", url },
    note: "Du hast dich nicht bei Boxentakt registriert? Dann kannst du diese Mail ignorieren.",
  }),
  email_change: tpl("Neue E-Mail-Adresse bestätigen – Boxentakt", {
    title: "Neue E-Mail-Adresse bestätigen",
    intro: "Die Adresse deines Boxentakt-Kontos soll von {{ .Email }} auf {{ .NewEmail }} geändert werden.",
    button: { label: "Änderung bestätigen", url },
    note: "Das warst nicht du? Dann ignoriere diese Mail, es ändert sich nichts.",
  }),
  invite: tpl("Einladung zu Boxentakt", {
    title: "Du wurdest zu Boxentakt eingeladen",
    intro: "Lege mit einem Klick dein Konto an und sieh den Kalender deines Salons.",
    button: { label: "Einladung annehmen", url },
  }),
  magic_link: tpl("Dein Anmeldelink – Boxentakt", {
    title: "Anmelden bei Boxentakt",
    button: { label: "Jetzt anmelden", url },
    body: "Der Link gilt eine Stunde und funktioniert nur einmal.",
    note: "Du wolltest dich nicht anmelden? Dann ignoriere diese Mail.",
  }),
};

const body: Record<string, string> = {};
for (const [k, v] of Object.entries(mails)) {
  body[`mailer_subjects_${k}`] = v.subject;
  body[`mailer_templates_${k}_content`] = v.html;
}
process.stdout.write(JSON.stringify(body));
