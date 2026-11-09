import { notFound } from "next/navigation";
import { MailX } from "lucide-react";
import { AuthCard } from "@/components/AuthBackdrop";
import { publicClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abgemeldet", robots: { index: false } };

/** Opt-out from review requests and rebooking reminders (link in every such mail). Booking confirmations still arrive. */
export default async function Page(props: PageProps<"/abmelden/[token]">) {
  const { token } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const { data } = await publicClient().rpc("unsubscribe_marketing", { p_token: token });
  if (!data) notFound();
  return (
    <AuthCard className="max-w-md">
      <main className="grid justify-items-center gap-5 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent"><MailX size={28} strokeWidth={1.75} /></span>
        <h1 className="text-2xl font-semibold">Sie sind abgemeldet</h1>
        <p className="text-muted">
          {String(data)} schickt Ihnen keine Bewertungsanfragen und Termin-Erinnerungen mehr. Bestätigungen zu Terminen, die Sie selbst buchen,
          bekommen Sie weiterhin.
        </p>
      </main>
    </AuthCard>
  );
}
