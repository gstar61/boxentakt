/**
 * Shared look of every mail (app mails and Supabase auth templates): light card on the site's background,
 * brand row, title, optional detail panel and one primary button. Table layout so Outlook and Gmail render it alike.
 * No imports: scripts/auth-templates.ts loads this file directly with Node.
 */

const C = { bg: "#F7F8FA", card: "#FFFFFF", line: "#E5E7EB", fg: "#0B1220", muted: "#64748B", accent: "#047857", panel: "#F7F8FA" };
const FONT = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SITE = "https://boxentakt.de";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type MailParts = {
  /** sender shown at the top: the platform, or the salon (with logo or initial) */
  brand: { kind: "platform" } | { kind: "salon"; name: string; logo?: string | null };
  /** grey preview line in the inbox list */
  preheader?: string;
  title: string;
  /** HTML paragraph(s) under the title */
  intro?: string;
  rows?: [string, string][];
  button?: { label: string; url: string };
  /** HTML after the button */
  body?: string;
  /** small grey HTML at the end of the card, e.g. unsubscribe */
  note?: string;
};

const strip = (html: string) =>
  html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, (_, url, label) => (label === url ? url : `${label}: ${url}`))
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .split("\n").map((l) => l.trim()).join("\n")
    .trim();

function brandRow(b: MailParts["brand"]) {
  if (b.kind === "platform") {
    return `<img src="${SITE}/icon-192.png" width="28" height="28" alt="" style="display:block;border-radius:8px">
      </td><td style="padding-left:10px;font:600 15px/1 ${FONT};color:${C.fg};letter-spacing:-0.01em">Boxentakt`;
  }
  const mark = b.logo
    ? `<img src="${esc(b.logo)}" width="32" height="32" alt="" style="display:block;border-radius:9px;object-fit:cover">`
    : `<div style="width:32px;height:32px;border-radius:9px;background:#ECFDF5;color:${C.accent};font:600 15px/32px ${FONT};text-align:center">${esc(b.name.trim().charAt(0).toUpperCase())}</div>`;
  return `${mark}</td><td style="padding-left:10px;font:600 15px/1.2 ${FONT};color:${C.fg};letter-spacing:-0.01em">${esc(b.name)}`;
}

/** HTML and plain-text version of one mail. */
export function mailLayout(m: MailParts) {
  const rows = m.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;background:${C.panel};border:1px solid ${C.line};border-radius:12px">
        ${m.rows
          .map(
            ([k, v], i) =>
              `<tr><td style="padding:${i ? 8 : 14}px 16px ${i === m.rows!.length - 1 ? 14 : 0}px;font:14px/1.4 ${FONT};color:${C.muted};white-space:nowrap;vertical-align:top;width:1%">${esc(k)}</td>
               <td style="padding:${i ? 8 : 14}px 16px ${i === m.rows!.length - 1 ? 14 : 0}px 0;font:500 14px/1.4 ${FONT};color:${C.fg};font-variant-numeric:tabular-nums">${esc(v)}</td></tr>`,
          )
          .join("")}
      </table>`
    : "";
  const button = m.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0"><tr><td style="border-radius:10px;background:${C.accent}">
        <a href="${esc(m.button.url)}" style="display:inline-block;padding:12px 20px;font:600 15px/1 ${FONT};color:#FFFFFF;text-decoration:none;border-radius:10px">${esc(m.button.label)}</a>
      </td></tr></table>`
    : "";
  const p = (html: string, top = 12) => `<div style="margin:${top}px 0 0;font:15px/1.6 ${FONT};color:#334155">${html}</div>`;

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(m.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
${m.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(m.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <tr><td style="padding:0 4px 16px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${brandRow(m.brand)}</td></tr></table></td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:28px 24px">
      <h1 style="margin:0;font:600 22px/1.3 ${FONT};color:${C.fg};letter-spacing:-0.02em">${esc(m.title)}</h1>
      ${m.intro ? p(m.intro) : ""}${rows}${button}${m.body ? p(m.body, 20) : ""}
      ${m.note ? `<div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid ${C.line};font:13px/1.5 ${FONT};color:${C.muted}">${m.note}</div>` : ""}
    </td></tr>
    <tr><td style="padding:16px 4px 0;font:12px/1.5 ${FONT};color:${C.muted}">
      Gesendet mit <a href="${SITE}" style="color:${C.muted}">Boxentakt</a> · Termine im Takt.
    </td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    m.brand.kind === "salon" ? m.brand.name : "Boxentakt",
    "",
    m.title,
    m.intro ? "\n" + strip(m.intro) : "",
    m.rows?.length ? "\n" + m.rows.map(([k, v]) => `${k}: ${v}`).join("\n") : "",
    m.button ? `\n${m.button.label}: ${m.button.url}` : "",
    m.body ? "\n" + strip(m.body) : "",
    m.note ? "\n" + strip(m.note) : "",
    "\n--\nGesendet mit Boxentakt – Termine im Takt. boxentakt.de",
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { html, text };
}
