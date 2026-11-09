import "server-only";
import Stripe from "stripe";
import { publicClient } from "./supabase";

let client: Stripe | undefined;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY fehlt");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export const stripeReady = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_DB_KEY);

/** Calls a key-protected stripe_* RPC (key 'stripe_key' in app_secrets = STRIPE_DB_KEY). */
export async function stripeRpc<T = unknown>(fn: string, args: Record<string, unknown>) {
  const { data, error } = await publicClient().rpc(fn, { p_key: process.env.STRIPE_DB_KEY ?? "", ...args });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export type Billing = {
  salon_id: string;
  exempt: boolean;
  trial_ends_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  salon_name: string;
  owner_email: string;
  slug: string;
};

/** Subscription fields as stored in salon_billing. */
export function subscriptionFields(sub: Stripe.Subscription) {
  const end = sub.items.data[0]?.current_period_end;
  return {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end || Boolean(sub.cancel_at),
  };
}
