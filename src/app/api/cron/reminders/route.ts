import { publicClient } from "@/lib/supabase";
import { deliverPendingEvents } from "@/lib/radsatzpro";
import { mailEnabled, sendDeletionNotice, sendFollowup, sendReminder, type DeletionNotice, type Followup } from "@/lib/mail";

export const dynamic = "force-dynamic";

/** Daily: reminders for tomorrow's appointments, follow-ups and the deletion of inactive salons. Called by Vercel Cron. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // RadsatzPro: liegengebliebene Ereignisse erneut versuchen (unabhängig vom Mailversand)
  const integration = await deliverPendingEvents(30).catch((e) => {
    console.error("integration delivery failed", e);
    return null;
  });
  if (!mailEnabled()) return Response.json({ sent: 0, skipped: "mail not configured", integration });
  const key = process.env.REMINDER_KEY ?? "";
  const [reminders, followups, deletions] = await Promise.all([
    publicClient().rpc("take_due_reminders", { p_key: key }),
    publicClient().rpc("take_due_followups", { p_key: key }),
    publicClient().rpc("take_due_deletions", { p_key: key }),
  ]);
  if (reminders.error) return Response.json({ error: reminders.error.message }, { status: 500 });
  if (followups.error) console.error("followups failed", followups.error);
  if (deletions.error) console.error("deletions failed", deletions.error);
  const results = await Promise.allSettled([
    ...((reminders.data ?? []) as Parameters<typeof sendReminder>[0][]).map(sendReminder),
    ...((followups.data ?? []) as Followup[]).map(sendFollowup),
    ...((deletions.data ?? []) as DeletionNotice[]).map(sendDeletionNotice),
  ]);
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((f) => console.error("mail failed", (f as PromiseRejectedResult).reason));
  return Response.json({ reminders: reminders.data?.length ?? 0, followups: followups.data?.length ?? 0, deletions: deletions.data?.length ?? 0, failed: failed.length, integration });
}
