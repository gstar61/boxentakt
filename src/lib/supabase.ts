import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Server-side client for public RPCs (no session). */
export function publicClient() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Server-side client acting as the signed-in salon user (RLS applies). */
export function userClient(accessToken: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

let browser: ReturnType<typeof createBrowserClient> | undefined;
/** Browser client with the salon user's session. */
export function browserClient() {
  browser ??= createBrowserClient(url, key);
  return browser;
}
