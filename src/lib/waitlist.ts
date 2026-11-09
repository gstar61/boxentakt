import "server-only";
import { publicClient } from "./supabase";
import { sendWaitlistOpening, type WaitlistHit } from "./mail";

/** Emails everyone waiting for the day of a cancelled appointment. Returns how many were told. */
export async function notifyWaitlist(ref: { appointmentId: string } | { cancelToken: string }) {
  const key = process.env.REMINDER_KEY ?? "";
  const { data, error } =
    "appointmentId" in ref
      ? await publicClient().rpc("take_waitlist", { p_key: key, p_appt: ref.appointmentId })
      : await publicClient().rpc("take_waitlist_by_token", { p_key: key, p_token: ref.cancelToken });
  if (error) {
    console.error("waitlist failed", error);
    return 0;
  }
  const hits = (data ?? []) as WaitlistHit[];
  const res = await Promise.allSettled(hits.map(sendWaitlistOpening));
  res.forEach((r) => r.status === "rejected" && console.error("waitlist mail failed", r.reason));
  return res.filter((r) => r.status === "fulfilled").length;
}
