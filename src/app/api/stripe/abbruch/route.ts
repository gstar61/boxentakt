import { redirect } from "next/navigation";
import { publicClient } from "@/lib/supabase";
import { stripe, stripeReady, stripeRpc } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Customer left the deposit checkout: free the reserved time right away and go back to the booking page. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) redirect("/");
  const { data } = await publicClient().rpc("appointment_by_token", { p_token: token });
  const slug = (data as { salon_slug: string } | null)?.salon_slug;
  if (stripeReady()) {
    const info = await stripeRpc<{ id: string; account: string | null; session: string | null; pending: boolean } | null>("stripe_refund_info", { p_token: token }).catch(() => null);
    if (info?.pending) {
      if (info.session && info.account) await stripe().checkout.sessions.expire(info.session, {}, { stripeAccount: info.account }).catch(() => {});
      await stripeRpc("stripe_appointment_release", { p_appt: info.id }).catch(() => {});
    }
  }
  redirect(slug ? `/${slug}?abgebrochen=1` : "/");
}
