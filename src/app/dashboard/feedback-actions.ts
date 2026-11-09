"use server";

import { userClient } from "@/lib/supabase";
import { sendFeedback } from "@/lib/mail";
import { OPERATOR } from "@/lib/operator";

type Kind = "idee" | "problem" | "lob";

/** Stores feedback (RLS: own user, member of the salon) and emails it to us. */
export async function submitFeedback(accessToken: string, input: { salonId: string | null; kind: Kind; message: string; page: string }) {
  const kind = (["idee", "problem", "lob"] as const).find((k) => k === input.kind);
  const message = String(input.message ?? "").trim().slice(0, 4000);
  if (!kind || message.length < 3) return { ok: false, message: "Bitte ein paar Worte schreiben." };
  const sb = userClient(String(accessToken));
  const { data: auth } = await sb.auth.getUser(String(accessToken));
  if (!auth.user) return { ok: false, message: "Bitte neu anmelden." };
  const page = String(input.page ?? "").slice(0, 200) || null;
  const salonId = input.salonId ? String(input.salonId) : null;
  const { error } = await sb.from("feedback").insert({ user_id: auth.user.id, salon_id: salonId, kind, message, page });
  if (error) console.error("feedback insert failed", error);
  let salon: string | null = null;
  if (salonId) {
    const { data } = await sb.from("salons").select("name").eq("id", salonId).maybeSingle();
    salon = (data as { name: string } | null)?.name ?? null;
  }
  const mailed = await sendFeedback({ to: process.env.FEEDBACK_TO || OPERATOR.email, kind, message, from: auth.user.email ?? "unbekannt", salon, page })
    .then((r) => !r.skipped)
    .catch((e) => (console.error("feedback mail failed", e), false));
  if (error && !mailed) return { ok: false, message: "Senden fehlgeschlagen. Bitte später erneut versuchen." };
  return { ok: true, message: "Danke! Wir lesen jedes Feedback und melden uns, wenn wir Fragen haben." };
}
