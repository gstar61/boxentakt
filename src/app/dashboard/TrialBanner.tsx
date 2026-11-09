"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { subscribed, trialDaysLeft, type BillingRow } from "./leistungen/BillingSection";

/** Shown in the last 7 trial days and after the trial ran out without a subscription. */
export function TrialBanner({ salonId }: { salonId: string }) {
  const [b, setB] = useState<BillingRow | null>(null);
  useEffect(() => {
    browserClient()
      .from("salon_billing")
      .select("*")
      .eq("salon_id", salonId)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => setB(data as BillingRow | null));
  }, [salonId]);
  if (!b || b.exempt || subscribed(b)) return null;
  const days = trialDaysLeft(b);
  if (days > 7) return null;
  return (
    <div className={`mb-5 flex items-center gap-3 rounded-[14px] border px-3 py-2.5 text-sm sm:mb-6 sm:px-4 sm:py-3 ${days ? "border-line bg-card" : "border-danger/40 bg-danger/10"}`}>
      <CreditCard size={16} className={`shrink-0 ${days ? "text-muted" : "text-danger"}`} />
      <span className="flex-1">
        {days
          ? <>Testphase endet in {days} {days === 1 ? "Tag" : "Tagen"}.<span className="hidden sm:inline"> Danach nimmt die Buchungsseite nur mit Abo Termine an.</span></>
          : `Die Testphase ist abgelaufen. Online-Buchungen sind pausiert, bis das Abo aktiv ist.${
              b.delete_after
                ? ` Ohne Abo löschen wir den Betrieb am ${new Date(b.delete_after).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}.`
                : ""
            }`}
      </span>
      <Link href="/dashboard/leistungen#abo" className="btn btn-sm shrink-0">Zum Abo</Link>
    </div>
  );
}
