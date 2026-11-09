import { browserClient } from "./supabase";
import { OPERATOR } from "./operator";

/**
 * Data access requests (Art. 15 GDPR) as JSON downloads, read in the browser through RLS:
 * the whole salon for its owner, or everything about one customer so the salon can answer her request.
 */

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const stamp = () => new Date().toISOString().slice(0, 10);

async function rows(table: string, column: string, value: string) {
  const { data, error } = await browserClient().from(table).select("*").eq(column, value);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

/** Everything Boxentakt stores for this salon and the signed-in account. */
export async function exportSalonData(salon: { id: string; slug: string }) {
  const sb = browserClient();
  const { data: auth } = await sb.auth.getUser();
  const u = auth.user;
  const [salons, billing, staff, services, hours, staffPrices, customers, appointments, absences, specialDays, vouchers, redemptions, waitlist, team, push, feedback] =
    await Promise.all([
      rows("salons", "id", salon.id),
      rows("salon_billing", "salon_id", salon.id),
      rows("staff", "salon_id", salon.id),
      rows("services", "salon_id", salon.id),
      rows("opening_hours", "salon_id", salon.id),
      rows("staff_prices", "salon_id", salon.id),
      rows("customers", "salon_id", salon.id),
      rows("appointments", "salon_id", salon.id),
      rows("absences", "salon_id", salon.id),
      rows("special_days", "salon_id", salon.id),
      rows("vouchers", "salon_id", salon.id),
      browserClient()
        .from("voucher_redemptions")
        .select("*, vouchers!inner(salon_id, code)")
        .eq("vouchers.salon_id", salon.id)
        .then(({ data }: { data: unknown[] | null }) => data ?? []),
      rows("waitlist", "salon_id", salon.id),
      sb.rpc("salon_team", { p_salon: salon.id }).then(({ data }: { data: unknown }) => data ?? []),
      u ? rows("push_subscriptions", "user_id", u.id) : [],
      u ? rows("feedback", "user_id", u.id) : [],
    ]);
  download(`boxentakt-daten-${salon.slug}-${stamp()}.json`, {
    auskunft: {
      erstellt: new Date().toISOString(),
      grundlage: "Art. 15 und Art. 20 DSGVO",
      anbieter: `${OPERATOR.company}, ${OPERATOR.address}, ${OPERATOR.email}`,
      zwecke: "Online-Terminbuchung, Kalender, Kundenkartei, Erinnerungen, Gutscheine, Abrechnung des Abos",
      empfaenger: "Supabase (Datenbank, Frankfurt), Vercel (Hosting), Resend (E-Mail-Versand), Stripe (Zahlungen)",
      speicherdauer: "Bis zur Löschung des Kontos; ohne Abo 90 Tage nach Ende der Testphase bzw. des Abos. Rechnungen bei Stripe nach gesetzlichen Fristen.",
    },
    konto: u ? { id: u.id, email: u.email, erstellt: u.created_at, letzte_anmeldung: u.last_sign_in_at, angaben: u.user_metadata } : null,
    salon: salons[0] ?? null,
    abo: billing[0] ?? null,
    team,
    mitarbeiter: staff,
    leistungen: services,
    preise_je_mitarbeiter: staffPrices,
    oeffnungszeiten: hours,
    abwesenheiten: absences,
    sondertage: specialDays,
    kunden: customers,
    termine: appointments,
    warteliste: waitlist,
    gutscheine: vouchers,
    gutschein_einloesungen: redemptions,
    push_geraete: push.map((p: Record<string, unknown>) => ({ ...p, p256dh: undefined, auth: undefined })),
    feedback,
  });
}

/** Everything the salon stores about one customer, to answer her access request (the salon is the controller). */
export async function exportCustomerData(salon: { id: string; slug: string; name: string }, customer: { id: string; email: string | null; phone: string | null }) {
  const sb = browserClient();
  const [cust, appointments, waitlist, vouchers] = await Promise.all([
    rows("customers", "id", customer.id),
    rows("appointments", "customer_id", customer.id),
    customer.email
      ? sb.from("waitlist").select("*").eq("salon_id", salon.id).ilike("email", customer.email).then(({ data }: { data: unknown[] | null }) => data ?? [])
      : [],
    customer.email
      ? sb.from("vouchers").select("*").eq("salon_id", salon.id).ilike("buyer_email", customer.email).then(({ data }: { data: unknown[] | null }) => data ?? [])
      : [],
  ]);
  const c = (cust[0] ?? {}) as Record<string, unknown>;
  download(`auskunft-${String(c.name ?? "kunde").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp()}.json`, {
    auskunft: {
      erstellt: new Date().toISOString(),
      grundlage: "Art. 15 DSGVO",
      verantwortlich: salon.name,
      auftragsverarbeiter: `Boxentakt (${OPERATOR.company})`,
      zwecke: "Terminbuchung und -verwaltung, Terminerinnerungen, Kundenkartei des Betriebs",
      empfaenger: "Supabase (Datenbank, Frankfurt), Vercel (Hosting), Resend (E-Mail-Versand), bei Anzahlung oder Gutschein Stripe",
      speicherdauer: "Solange Sie Kunde des Betriebs sind oder bis zur Löschung auf Wunsch",
    },
    kunde: { ...c, unsubscribe_token: undefined },
    termine: appointments.map((a: Record<string, unknown>) => ({ ...a, cancel_token: undefined })),
    warteliste: waitlist,
    gutscheine: (vouchers as Record<string, unknown>[]).map((v) => ({ ...v, token: undefined, stripe_session_id: undefined })),
  });
}
