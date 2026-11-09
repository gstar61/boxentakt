import "server-only";
import webpush, { type PushSubscription } from "web-push";
import { publicClient } from "./supabase";
import type { Booked } from "./mail";

type Target = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

export function pushEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:termine@trimtable.de", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Sends to each device; returns the endpoints the push service reported as gone (404/410). */
export async function sendPush(targets: Target[], msg: PushMessage) {
  if (!pushEnabled() || !targets.length) return [];
  setup();
  const gone: string[] = [];
  await Promise.all(
    targets.map(async (t) => {
      const sub: PushSubscription = { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } };
      try {
        await webpush.sendNotification(sub, JSON.stringify(msg), { TTL: 60 * 60 * 24, urgency: "high" });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(t.endpoint);
        else console.error("push failed", code, e);
      }
    }),
  );
  return gone;
}

/** Notifies the salon team's devices about a new online booking. Never throws. */
export async function pushNewBooking(appointmentId: string, b: Booked, customerName: string) {
  if (!pushEnabled()) return;
  try {
    const key = process.env.REMINDER_KEY ?? "";
    const sb = publicClient();
    const { data, error } = await sb.rpc("push_targets", { p_key: key, p_appt: appointmentId });
    if (error) return console.error("push targets failed", error);
    const start = new Date(b.starts_at);
    const when = new Intl.DateTimeFormat("de-DE", { timeZone: b.timezone, weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(start);
    const gone = await sendPush((data ?? []) as Target[], {
      title: "Neue Buchung",
      body: `${customerName} · ${b.service_name}\n${when} Uhr${b.staff_name ? ` bei ${b.staff_name}` : ""}`,
      url: "/dashboard",
      tag: `appt-${appointmentId}`,
    });
    await Promise.all(gone.map((endpoint) => sb.rpc("push_forget", { p_key: key, p_endpoint: endpoint })));
  } catch (e) {
    console.error("push booking failed", e);
  }
}
