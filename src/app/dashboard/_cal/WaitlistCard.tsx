"use client";

import { useEffect, useState } from "react";
import { BellPlus, X } from "lucide-react";
import { browserClient } from "@/lib/supabase";

type Entry = { id: string; name: string; email: string; phone: string | null; notified_at: string | null; services: { name: string } | null };

/** Who is waiting for a slot on this day; informed automatically when an appointment is cancelled. */
export function WaitlistCard({ salonId, date }: { salonId: string; date: string }) {
  const [list, setList] = useState<Entry[]>([]);
  useEffect(() => {
    let live = true;
    browserClient()
      .from("waitlist")
      .select("id,name,email,phone,notified_at,services(name)")
      .eq("salon_id", salonId)
      .eq("day", date)
      .order("created_at")
      .then(({ data }: { data: unknown }) => live && setList((data ?? []) as Entry[]));
    return () => { live = false; };
  }, [salonId, date]);

  async function remove(id: string) {
    await browserClient().from("waitlist").delete().eq("id", id);
    setList((l) => l.filter((e) => e.id !== id));
  }

  if (!list.length) return null;
  return (
    <section className="card grid gap-3 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><BellPlus size={16} className="text-accent" /> Warteliste für diesen Tag ({list.length})</h2>
      <ul className="grid gap-1.5 text-sm">
        {list.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl border border-line px-3 py-2">
            <span className="font-medium">{e.name}</span>
            {e.services && <span className="text-muted">{e.services.name}</span>}
            <a href={`mailto:${e.email}`} className="text-muted hover:text-fg">{e.email}</a>
            {e.notified_at && <span className="text-xs text-accent">benachrichtigt</span>}
            <button className="icon-btn ml-auto !size-8" aria-label={`${e.name} von der Warteliste nehmen`} onClick={() => remove(e.id)}><X size={14} /></button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-dim">Sagt jemand an diesem Tag ab, bekommen alle hier automatisch eine E-Mail.</p>
    </section>
  );
}
