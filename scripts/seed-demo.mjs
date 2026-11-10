// Demo-Daten für die lokale Entwicklung (supabase start). Idempotent: mehrfach ausführbar.
// Aufruf: npm run seed:demo   (liest NEXT_PUBLIC_SUPABASE_URL und den Schlüssel aus .env.local bzw. `supabase status`)
// Läuft ausschließlich gegen 127.0.0.1 / localhost und bricht sonst ab.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";

const DEMO = {
  email: "demo@boxentakt.local",
  password: "demo-werkstatt",
  salon: "Werkstatt Mira",
  slug: "werkstatt-mira",
  staff: ["Mira", "Jonas"],
  places: ["Hebebühne 1", "Hebebühne 2"],
};
const TZ = "Europe/Berlin";

function env() {
  const out = { ...process.env };
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2];
    }
  }
  return out;
}

const e = env();
const url = e.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost"].includes(host)) {
  console.error(`Abbruch: seed:demo läuft nur lokal, nicht gegen ${host}.`);
  process.exit(1);
}

// Lokaler Admin-Schlüssel aus `supabase status` (existiert nur im lokalen Stack)
let status;
try {
  status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch {
  console.error("Abbruch: lokaler Supabase-Stack läuft nicht (npx supabase start).");
  process.exit(1);
}
if (!["127.0.0.1", "localhost"].includes(new URL(status.API_URL).hostname)) {
  console.error("Abbruch: supabase status zeigt keine lokale URL.");
  process.exit(1);
}
const publishable = e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || status.PUBLISHABLE_KEY;
const admin = createClient(url, status.SECRET_KEY || status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, publishable, { auth: { persistSession: false } });

const fail = (what, error) => {
  if (error) {
    console.error(`Fehler bei ${what}: ${error.message}`);
    process.exit(1);
  }
};

// 1. Demo-Nutzer (bestätigt, damit create_salon ihn akzeptiert)
const { data: users, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
fail("Nutzerliste", listErr);
if (!users.users.some((u) => u.email === DEMO.email)) {
  const { error } = await admin.auth.admin.createUser({ email: DEMO.email, password: DEMO.password, email_confirm: true });
  fail("Demo-Nutzer", error);
  console.log(`Nutzer angelegt: ${DEMO.email}`);
}

// 2. Betrieb über create_salon als Demo-Nutzer (legt Mitarbeiter, Öffnungszeiten, Hebebühne 1, Startleistungen an)
let { data: salon } = await admin.from("salons").select("id").eq("slug", DEMO.slug).maybeSingle();
if (!salon) {
  const { error: loginErr } = await anon.auth.signInWithPassword({ email: DEMO.email, password: DEMO.password });
  fail("Anmeldung Demo-Nutzer", loginErr);
  const { error } = await anon.rpc("create_salon", { p_name: DEMO.salon, p_slug: DEMO.slug, p_staff_name: DEMO.staff[0] });
  fail("create_salon", error);
  await anon.auth.signOut();
  ({ data: salon } = await admin.from("salons").select("id").eq("slug", DEMO.slug).single());
  console.log(`Betrieb angelegt: /${DEMO.slug}`);
}
const salonId = salon.id;
await admin.from("salons").update({ address: "Musterstraße 1, 68159 Mannheim", phone: "0621 000000" }).eq("id", salonId);

// 3. Zweiter Mitarbeiter, zweite Hebebühne
const { data: staff } = await admin.from("staff").select("name").eq("salon_id", salonId);
for (const [i, name] of DEMO.staff.entries()) {
  if (!staff.some((s) => s.name === name)) {
    fail(`Mitarbeiter ${name}`, (await admin.from("staff").insert({ salon_id: salonId, name, sort: i + 1 })).error);
  }
}
const { data: places } = await admin.from("resources").select("name").eq("salon_id", salonId);
for (const [i, name] of DEMO.places.entries()) {
  if (!places.some((p) => p.name === name)) {
    fail(`Platz ${name}`, (await admin.from("resources").insert({ salon_id: salonId, name, kind: "buehne", sort: i + 1 })).error);
  }
}

// 4. Öffnungszeiten Mo–Fr 8–17 Uhr sicherstellen
const { data: hours } = await admin.from("opening_hours").select("weekday").eq("salon_id", salonId);
for (let d = 1; d <= 5; d++) {
  if (!hours.some((h) => h.weekday === d)) {
    fail(`Öffnungszeit Tag ${d}`, (await admin.from("opening_hours").insert({ salon_id: salonId, weekday: d, opens: "08:00", closes: "17:00" })).error);
  }
}

// 5. Termine an den nächsten Werktagen (über die öffentliche Buchungsfunktion, nur Testdaten)
const { data: services } = await admin.from("services").select("id,name").eq("salon_id", salonId);
const sid = (name) => services.find((s) => s.name === name)?.id;
const workdays = [];
for (let d = new Date(); workdays.length < 3; ) {
  d = new Date(d.getTime() + 86_400_000);
  const wd = new Date(d.toLocaleString("en-US", { timeZone: TZ })).getDay();
  if (wd >= 1 && wd <= 5) workdays.push(d.toLocaleDateString("sv-SE", { timeZone: TZ }));
}
const demo = [
  { day: 0, time: "09:00", service: "Räderwechsel (Sommer/Winter)", cls: "pkw", plate: "MA-MR 123", name: "Anna Beispiel", vehicle: "VW Golf" },
  { day: 0, time: "09:00", service: "Ölwechsel inkl. Filter", cls: "suv", plate: "HD-BT 77", name: "Bernd Test", vehicle: "Audi Q5" },
  { day: 0, time: "11:00", service: "Inspektion", cls: "transporter", plate: "MA-XY 2024", name: "Carla Muster", vehicle: "Ford Transit" },
  { day: 1, time: "08:30", service: "HU/AU", cls: "pkw", plate: "LU-DE 5", name: "Dieter Demo", vehicle: "Opel Corsa" },
  { day: 1, time: "13:00", service: "Räderwechsel mit Einlagerung", cls: "suv", plate: "MA-EL 99", name: "Eva Probe", vehicle: "BMW X3" },
  { day: 2, time: "10:00", service: "Achsvermessung", cls: "pkw", plate: "WO-FA 12", name: "Frank Fiktiv", vehicle: "Skoda Octavia" },
];
const { data: existing } = await admin.from("appointments").select("license_plate,during,status").eq("salon_id", salonId);
// Range-Ende "2026-11-11 08:45:00+00" → Date
const rangeEnd = (r) => new Date(r.split(",")[1].replace(/[")\]]/g, "").replace(" ", "T").replace(/\+00$/, "Z"));
const upcoming = new Set(existing.filter((a) => a.status === "gebucht" && rangeEnd(a.during) > new Date()).map((a) => a.license_plate));
let booked = 0;
for (const [i, t] of demo.entries()) {
  if (upcoming.has(t.plate)) continue;
  const start = fromZonedTime(`${workdays[t.day]}T${t.time}:00`, TZ);
  const { error } = await anon.rpc("book_services", {
    p_slug: DEMO.slug,
    p_services: [sid(t.service)],
    p_staff: null,
    p_start: start.toISOString(),
    p_name: t.name,
    p_phone: `0621 10000${i}`,
    p_email: null,
    p_note: "Demo-Termin",
    p_plate: t.plate,
    p_class: t.cls,
    p_vehicle: t.vehicle,
  });
  if (error) console.warn(`Termin ${t.plate} übersprungen: ${error.message}`);
  else booked++;
}

console.log(`Fertig. ${booked} neue Demo-Termine.`);
console.log(`Login: ${DEMO.email} / ${DEMO.password}  ·  Buchungsseite: http://localhost:3000/${DEMO.slug}`);
