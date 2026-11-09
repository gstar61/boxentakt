// Usage: node scripts/mock-supabase.mjs  (COVER=1 for logo/cover), then build/start with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
// Minimal Supabase stand-in (PostgREST + auth) with demo data for local screenshots.
import http from "node:http";
import fs from "node:fs";
const SALON = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const tz = "Europe/Berlin";
const staff = [
  { id: "s1", salon_id: SALON, name: "Anna", sort: 1, active: true },
  { id: "s2", salon_id: SALON, name: "Marco", sort: 2, active: true },
  { id: "s3", salon_id: SALON, name: "Lea", sort: 3, active: true },
];
const services = [
  ["Räderwechsel (Sommer/Winter)", 45, 4900], ["Räderwechsel mit Einlagerung", 45, 5900], ["Ölwechsel inkl. Filter", 60, 8900],
  ["Inspektion", 120, 14900], ["HU/AU", 60, 12900], ["Achsvermessung", 60, 8900],
].map(([name, duration_min, price_cents], i) => ({ id: `v${i}`, salon_id: SALON, name, duration_min, price_cents, active: true, sort: i }));
const hours = [1, 2, 3, 4, 5].flatMap((w) => [{ weekday: w, opens: "09:00:00", closes: "13:00:00" }, { weekday: w, opens: "14:00:00", closes: "19:00:00" }]).concat([{ weekday: 6, opens: "09:00:00", closes: "15:00:00" }]);
const cover = process.env.COVER === "1";
const salon = {
  id: SALON, slug: "werkstatt-mira", name: "Autowerkstatt Mira", address: "Q7 12, 68161 Mannheim", phone: "0621 1234567",
  notice: "Samstag ab 15 Uhr nur nach Vereinbarung.", legal_name: "Mira Beispiel", contact_email: "hallo@werkstatt-mira.de", vat_id: null, legal_extra: null,
  owner_email: "mira@example.com", timezone: tz, slot_step: 15, booking_days: 28, deposit_percent: 20,
  logo_url: cover ? "http://localhost:54321/storage/v1/object/public/salon-media/logo.png" : null,
  cover_url: cover ? "http://localhost:54321/storage/v1/object/public/salon-media/cover.jpg" : null,
  created_at: "2026-10-01T10:00:00Z",
};
const names = ["Laura Meier", "Tim Roth", "Sabine Weber", "Deniz Yilmaz", "Mia Schulz", "Jonas Klein", "Elif Kaya", "Paul Wagner", "Nora Becker", "Ali Demir"];
const customers = names.map((name, i) => ({ id: `c${i}`, salon_id: SALON, name, phone: `0176 ${1000000 + i * 4711}`, email: i % 2 ? null : `${name.split(" ")[0].toLowerCase()}@example.com`, note: i === 2 ? "Allergie gegen PPD" : null, created_at: "2026-09-01T10:00:00Z" }));
const day = new Date(new Date().toLocaleString("en-US", { timeZone: tz })); // local "today"
const iso = (h, m, add = 0) => { const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate() + add, h - 1, m)); return d.toISOString(); };
const plan = [
  [0, "s1", 0, 9, 0, 60, "erschienen", "salon"], [1, "s1", 2, 10, 15, 30, "gebucht", "online"], [2, "s1", 4, 11, 0, 90, "gebucht", "online"],
  [3, "s2", 3, 9, 30, 45, "erschienen", "online"], [4, "s2", 2, 11, 0, 30, "nicht_erschienen", "salon"], [5, "s2", 5, 14, 0, 180, "gebucht", "online"],
  [6, "s3", 1, 9, 0, 30, "gebucht", "salon"], [7, "s3", 0, 14, 30, 60, "gebucht", "online"], [8, "s3", 3, 16, 0, 45, "gebucht", "online"],
];
const appointments = plan.map(([c, s, v, h, m, dur, status, source], i) => ({
  id: `a${i}`, salon_id: SALON, staff_id: s, customer_id: `c${c}`, service_id: `v${v}`, service_name: services[v].name, price_cents: services[v].price_cents,
  during: `["${iso(h, m)}","${iso(h, m + dur)}")`, status, source, note: i === 2 ? "Bitte etwas kürzer als letztes Mal" : null,
  deposit_cents: i === 5 ? 3200 : null, payment_status: i === 5 ? "paid" : null, payment_expires_at: null, cancel_token: "t",
  customers: { name: customers[c].name, phone: customers[c].phone, email: customers[c].email, note: customers[c].note },
}));
const absences = [{ id: "ab1", salon_id: SALON, staff_id: "s3", during: `["${iso(12, 0)}","${iso(13, 0)}")`, reason: "Arzttermin" }];
const stats = customers.map((c, i) => ({ salon_id: SALON, customer_id: c.id, bookings: 3 + i, visits: 2 + i, no_shows: i === 4 ? 1 : 0, cancellations: i % 3 ? 0 : 1, last_visit: "2026-10-10T09:00:00Z", next_visit: i < 4 ? iso(10, 0, 3) : null, revenue_cents: (2 + i) * 4500 }));
const billing = { salon_id: SALON, exempt: false, trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(), stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null, current_period_end: null, cancel_at_period_end: false, stripe_account_id: "acct_x", charges_enabled: true };
const dayStr = (add) => iso(12, 0, add).slice(0, 10);
const holidays = [{ day: dayStr(4), name: "Feiertag (Demo)" }];
const special_days = [{ salon_id: SALON, day: dayStr(2), opens: "09:00", closes: "13:00", note: "Heiligabend" }, ...[8, 9, 10].map((d) => ({ salon_id: SALON, day: dayStr(d), opens: null, closes: null, note: "Betriebsurlaub" }))];
salon.holiday_state = "BW";
salon.vouchers_enabled = true;
const voucherRow = { id: "vo1", salon_id: SALON, code: "TT-K7QM-4XPA", token: "11111111-2222-3333-4444-555555555555", amount_cents: 5000, balance_cents: 2000, status: "active", source: "online", buyer_name: "Laura Meier", recipient_name: "Mama", created_at: "2026-10-20T10:00:00Z", valid_until: "2029-12-31" };
const voucherPublic = { ...voucherRow, message: "Alles Liebe zum Geburtstag – gönn dir was Schönes!", salon_name: salon.name, salon_slug: salon.slug, salon_logo: null, salon_address: salon.address, salon_phone: salon.phone };
const apptStart = new Date(Date.now() + 2 * 86400_000); apptStart.setUTCHours(9, 0, 0, 0);
const apptByToken = { status: "gebucht", service_name: services[0].name, price_cents: services[0].price_cents, starts_at: apptStart.toISOString(),
  ends_at: new Date(+apptStart + services[0].duration_min * 60_000).toISOString(), staff_name: staff[0].name, staff_id: staff[0].id,
  duration_min: services[0].duration_min, salon_name: salon.name, salon_slug: salon.slug, salon_phone: salon.phone, timezone: salon.timezone,
  deposit_cents: null, payment_status: null, deposit_refundable: false, can_cancel: true, can_move: true };
const pub = { ...salon, holidays, special_days, bookable: true, staff: staff.map(({ id, name }) => ({ id, name })), services: services.map(({ id, name, duration_min, price_cents }) => ({ id, name, duration_min, price_cents })), hours: hours.map((h) => ({ weekday: h.weekday, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) })) };
const tables = { salons: [salon], staff, services, opening_hours: hours, salon_members: [{ salon_id: SALON, user_id: USER, role: "owner" }], appointments, absences, customers, customer_stats: stats, salon_billing: [billing], salon_invites: [], special_days, staff_prices: [], vouchers: [voucherRow, { ...voucherRow, id: "vo2", code: "TT-8HNR-2WKE", source: "salon", buyer_name: null, recipient_name: null, amount_cents: 3000, balance_cents: 3000 }] };
const user = { id: USER, aud: "authenticated", role: "authenticated", email: "mira@example.com", user_metadata: { first_name: "Mira" }, app_metadata: {}, created_at: "2026-10-01T10:00:00Z" };
const png1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  const json = (data, code = 200) => res.writeHead(code, { ...cors, "content-type": "application/json" }).end(JSON.stringify(data));
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    if (u.pathname.startsWith("/storage/")) { const f = u.pathname.endsWith(".jpg") ? "cover.jpg" : "logo.png"; return res.writeHead(200, { ...cors, "content-type": f.endsWith("jpg") ? "image/jpeg" : "image/png" }).end((fs.existsSync(new URL("./" + f, import.meta.url)) ? fs.readFileSync(new URL("./" + f, import.meta.url)) : png1)); }
    if (u.pathname === "/auth/v1/user") return json(user);
    if (u.pathname.startsWith("/auth/v1/")) return json({});
    const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpc) return json({ public_salon: pub, busy_intervals: appointments.filter((a) => a.status !== "storniert").map((a) => { const [s, e] = JSON.parse(a.during.replace(")", "]")); return { staff_id: a.staff_id, starts_at: s, ends_at: e }; }), salon_team: [{ kind: "member", user_id: USER, email: user.email, role: "owner" }], public_holidays: holidays, salon_vouchers_open: true, voucher_by_token: voucherPublic, voucher_lookup: voucherRow, appointment_by_token: apptByToken }[rpc] ?? null);
    const t = u.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
    if (t && req.method === "GET") {
      let rows = tables[t] ?? [];
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(rows[0]) : json({ code: "PGRST116" }, 406);
      return json(rows);
    }
    if (t) return json(null, 204);
    json({}, 404);
  });
}).listen(54321, () => console.log("mock on 54321"));
