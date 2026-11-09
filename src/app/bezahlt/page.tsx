import { CheckCircle2, CircleX } from "lucide-react";
import { AuthCard } from "@/components/AuthBackdrop";

export const metadata = { title: "Zahlung", robots: { index: false } };

/** Landing page after paying at the counter via QR code. */
export default async function Page(props: PageProps<"/bezahlt">) {
  const q = await props.searchParams;
  const aborted = q.abgebrochen === "1";
  return (
    <AuthCard className="max-w-md">
      <main className="grid justify-items-center gap-5 text-center">
      <span className={`grid size-16 place-items-center rounded-2xl ${aborted ? "bg-fg/5 text-muted" : "bg-accent/10 text-accent"}`}>
        {aborted ? <CircleX size={34} strokeWidth={1.75} /> : <CheckCircle2 size={34} strokeWidth={1.75} />}
      </span>
      <h1 className="text-2xl font-semibold">{aborted ? "Zahlung abgebrochen" : "Danke, bezahlt!"}</h1>
      <p className="text-muted">
        {aborted ? "Es wurde nichts abgebucht. Sie können den QR-Code im Salon erneut scannen." : "Die Zahlung ist beim Salon eingegangen. Den Beleg schickt Stripe per E-Mail."}
      </p>
    </main>
      </AuthCard>
  );
}
