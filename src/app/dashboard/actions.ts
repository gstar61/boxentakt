"use server";

import { userClient } from "@/lib/supabase";
import { sendCustomerUpdate, sendInvite } from "@/lib/mail";
import { parseRange } from "@/lib/time";
import { notifyWaitlist } from "@/lib/waitlist";

type Row = {
  status: string;
  service_name: string;
  during: string;
  cancel_token: string;
  customers: { name: string; email: string | null } | null;
  staff: { name: string } | null;
  salons: { name: string; phone: string | null; slug: string; timezone: string; owner_email: string; contact_email: string | null; logo_url: string | null } | null;
};

/** Emails the customer after the salon cancelled or moved an appointment. RLS ensures the caller belongs to the salon. */
export async function notifyCustomer(accessToken: string, appointmentId: string, kind: "cancelled" | "moved") {
  const { data, error } = await userClient(String(accessToken))
    .from("appointments")
    .select("status,service_name,during,cancel_token,customers(name,email),staff(name),salons(name,phone,slug,timezone,owner_email,contact_email,logo_url)")
    .eq("id", String(appointmentId))
    .maybeSingle();
  const a = data as unknown as Row | null;
  if (error || !a?.customers?.email || !a.salons) return { sent: false };
  try {
    const r = await sendCustomerUpdate({
      kind,
      email: a.customers.email,
      customer_name: a.customers.name,
      service_name: a.service_name,
      starts_at: parseRange(a.during)[0].toISOString(),
      staff_name: a.staff?.name ?? "",
      salon_name: a.salons.name,
      salon_phone: a.salons.phone,
      salon_slug: a.salons.slug,
      timezone: a.salons.timezone,
      cancel_token: a.cancel_token,
      reply_to: a.salons.contact_email || a.salons.owner_email,
      salon_logo: a.salons.logo_url,
    });
    return { sent: !r.skipped };
  } catch (e) {
    console.error("notify failed", e);
    return { sent: false };
  }
}

/** Creates a team invitation (RLS: caller must be a member) and emails it. */
export async function inviteMember(accessToken: string, salonId: string, email: string, role: "owner" | "staff") {
  const mail = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { ok: false, message: "Bitte eine gültige E-Mail-Adresse eintragen." };
  const sb = userClient(String(accessToken));
  const { data: auth } = await sb.auth.getUser(String(accessToken));
  const { error } = await sb.from("salon_invites").upsert({ salon_id: String(salonId), email: mail, role: role === "owner" ? "owner" : "staff", accepted_at: null });
  if (error) return { ok: false, message: "Einladung konnte nicht gespeichert werden." };
  const { data: salon } = await sb.from("salons").select("name").eq("id", String(salonId)).maybeSingle();
  try {
    const r = await sendInvite(mail, (salon as { name: string } | null)?.name ?? "Salon", auth.user?.email ?? "");
    return { ok: true, message: r.skipped ? "Einladung gespeichert (E-Mail-Versand nicht eingerichtet)." : `Einladung an ${mail} gesendet.` };
  } catch (e) {
    console.error("invite mail failed", e);
    return { ok: true, message: "Einladung gespeichert, E-Mail konnte nicht gesendet werden." };
  }
}

/** After the salon cancelled an appointment: tell the waitlist for that day. RLS check: the caller must see the appointment. */
export async function notifyWaitlistForCancel(accessToken: string, appointmentId: string) {
  const { data } = await userClient(String(accessToken)).from("appointments").select("id").eq("id", String(appointmentId)).maybeSingle();
  if (!data) return 0;
  return notifyWaitlist({ appointmentId: String(appointmentId) });
}
