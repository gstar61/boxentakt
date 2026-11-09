"use server";

import { userClient } from "@/lib/supabase";
import { pushEnabled, sendPush } from "@/lib/push";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Stores this device for the caller; RLS checks that the caller belongs to the salon. */
export async function savePushDevice(accessToken: string, salonId: string, sub: Sub) {
  const sb = userClient(String(accessToken));
  const { data: auth } = await sb.auth.getUser(String(accessToken));
  if (!auth.user || !/^https:\/\//.test(String(sub?.endpoint))) return { ok: false };
  const { error } = await sb.from("push_subscriptions").upsert({
    endpoint: String(sub.endpoint),
    user_id: auth.user.id,
    salon_id: String(salonId),
    p256dh: String(sub.keys?.p256dh ?? ""),
    auth: String(sub.keys?.auth ?? ""),
  });
  if (error) console.error("push save failed", error);
  return { ok: !error };
}

export async function removePushDevice(accessToken: string, endpoint: string) {
  const { error } = await userClient(String(accessToken)).from("push_subscriptions").delete().eq("endpoint", String(endpoint));
  return { ok: !error };
}

/** Test notification to one of the caller's own devices. */
export async function testPush(accessToken: string, endpoint: string) {
  if (!pushEnabled()) return { ok: false };
  const sb = userClient(String(accessToken));
  const { data } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth").eq("endpoint", String(endpoint)).maybeSingle();
  if (!data) return { ok: false };
  const gone = await sendPush([data], { title: "Boxentakt", body: "So sieht eine Benachrichtigung für neue Buchungen aus.", url: "/dashboard", tag: "test" });
  if (gone.length) await sb.from("push_subscriptions").delete().eq("endpoint", String(endpoint));
  return { ok: !gone.length };
}
