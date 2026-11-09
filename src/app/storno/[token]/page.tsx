import { notFound } from "next/navigation";
import { publicClient } from "@/lib/supabase";
import { euro, fullDateTime } from "@/lib/time";
import CancelButton from "./CancelButton";
import RescheduleBox from "./RescheduleBox";
import { loadSalon } from "@/lib/salon";
import { AuthCard } from "@/components/AuthBackdrop";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ihr Termin", robots: { index: false } };

type Appt = {
  status: string;
  service_name: string;
  price_cents: number;
  starts_at: string;
  staff_name: string;
  salon_name: string;
  salon_slug: string;
  salon_phone: string | null;
  timezone: string;
  can_cancel: boolean;
  can_move?: boolean;
  deposit_cents: number | null;
  payment_status: "pending" | "paid" | "refunded" | "expired" | null;
  deposit_refundable: boolean;
};

const PAYMENT = { pending: "wird bestätigt", paid: "bezahlt", refunded: "erstattet", expired: "nicht bezahlt" } as const;

export default async function Page(props: PageProps<"/storno/[token]">) {
  const { token } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const { data } = await publicClient().rpc("appointment_by_token", { p_token: token });
  const a = data as Appt | null;
  if (!a) notFound();
  const paidJustNow = (await props.searchParams).bezahlt === "1" && a.status !== "storniert";
  const salon = a.can_move ? await loadSalon(a.salon_slug) : null;

  return (
    <AuthCard className="max-w-xl">
      <main className="grid gap-6">
      <span className="label">{a.salon_name}</span>
      <h1 className="text-3xl font-semibold">{a.status === "storniert" ? "Termin ist abgesagt" : paidJustNow ? "Termin ist gebucht" : a.can_move ? "Termin verschieben oder absagen" : "Termin absagen"}</h1>
      {paidJustNow && (
        <p className="text-muted">Danke, die Anzahlung ist eingegangen. Die Bestätigung mit diesem Link kommt per E-Mail.</p>
      )}
      <dl className="card grid gap-2.5 p-5 text-sm">
        {[
          ["Termin", fullDateTime(a.starts_at, a.timezone)],
          ["Leistung", a.service_name],
          ["Bei", a.staff_name],
          ["Preis", euro(a.price_cents)],
          ...(a.deposit_cents && a.payment_status ? [["Anzahlung", `${euro(a.deposit_cents)} (${PAYMENT[a.payment_status]})`]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {a.status === "storniert" ? (
        <a className="btn w-fit" href={`/${a.salon_slug}`}>Neuen Termin buchen</a>
      ) : a.can_cancel ? (
        <>
          {a.payment_status === "paid" && (
            <p className="text-sm text-muted">
              {a.deposit_refundable
                ? "Bei Absage jetzt wird die Anzahlung automatisch erstattet."
                : "Weniger als 24 Stunden vor dem Termin wird die Anzahlung bei Absage nicht erstattet."}
            </p>
          )}
          {salon && (
            <RescheduleBox token={token} tz={salon.timezone} hours={salon.hours} closures={salon} bookingDays={salon.booking_days} />
          )}
          <CancelButton token={token} slug={a.salon_slug} />
        </>
      ) : a.payment_status === "pending" ? (
        <p className="empty">Die Zahlung wird noch bestätigt. Bitte die Seite gleich neu laden.</p>
      ) : (
        <p className="empty">
          Online verschieben oder absagen geht nur bis 2 Stunden vor dem Termin.{a.salon_phone ? ` Bitte rufen Sie den Salon an: ${a.salon_phone}` : ""}
        </p>
      )}
    </main>
      </AuthCard>
  );
}
