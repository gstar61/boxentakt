"use client";

import { useEffect, useState } from "react";
import { Plus, UserRound, X } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { atLocal, duration, euro } from "@/lib/time";
import { Drawer, Select, TextField } from "../ui";
import { SlotPicker } from "./SlotPicker";
import { PLACE_FULL, normPhone, pickPlace } from "./data";
import { priceWith, useSalon, type ResourceKind } from "../salon-context";

type Found = { id: string; name: string; phone: string | null };

export function CreateDialog(props: {
  salonId: string;
  tz: string;
  step: number;
  initial: { date: string; staffId: string; min: number | null };
  services: { id: string; name: string; duration_min: number; price_cents: number; resource_kind?: ResourceKind | null }[];
  staff: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(props.initial.date);
  const [serviceId, setServiceId] = useState(props.services[0]?.id ?? "");
  const [staffId, setStaffId] = useState(props.initial.staffId);
  const [min, setMin] = useState<number | null>(props.initial.min);
  const [customer, setCustomer] = useState<Found | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [plate, setPlate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const service = props.services.find((s) => s.id === serviceId);
  const { staffPrices, resources } = useSalon();

  // typeahead over existing customers
  useEffect(() => {
    const term = q.trim().replace(/[,()%*]/g, "");
    if (customer || term.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const digits = normPhone(term);
      const filter = digits.length >= 3 ? `name.ilike.%${term}%,phone_norm.ilike.%${digits}%` : `name.ilike.%${term}%`;
      const { data } = await browserClient().from("customers").select("id,name,phone").eq("salon_id", props.salonId).or(filter).order("name").limit(6);
      if (live) setFound((data ?? []) as Found[]);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, customer, props.salonId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!service || min == null) return setErr("Bitte Leistung und Uhrzeit wählen.");
    const name = (customer?.name ?? q).trim();
    if (name.length < 2) return setErr("Bitte einen Kunden wählen oder einen Namen eintragen.");
    setBusy(true);
    const sb = browserClient();
    let customerId = customer?.id ?? null;
    let created = false;
    if (!customerId && phone.trim()) {
      const { data } = await sb.from("customers").select("id").eq("salon_id", props.salonId).eq("phone_norm", normPhone(phone)).limit(1);
      customerId = (data?.[0] as { id: string } | undefined)?.id ?? null;
    }
    if (!customerId) {
      const { data, error } = await sb.from("customers").insert({ salon_id: props.salonId, name, phone: phone.trim() || null }).select("id").single();
      if (error || !data) {
        setBusy(false);
        return setErr("Kunde konnte nicht gespeichert werden.");
      }
      customerId = (data as { id: string }).id;
      created = true;
    }
    const start = atLocal(date, min, props.tz);
    const end = new Date(start.getTime() + service.duration_min * 60000);
    let place: string | null | undefined;
    try {
      place = await pickPlace(resources, service.resource_kind, start, end);
    } catch {
      place = undefined;
    }
    if (place === null) {
      if (created) await sb.from("customers").delete().eq("id", customerId);
      setBusy(false);
      return setErr(PLACE_FULL);
    }
    const { error } = await sb.from("appointments").insert({
      resource_id: place ?? null,
      salon_id: props.salonId,
      staff_id: staffId,
      service_id: service.id,
      customer_id: customerId,
      service_name: service.name,
      price_cents: priceWith(service, staffId, staffPrices),
      during: `[${start.toISOString()},${end.toISOString()})`,
      source: "salon",
      note: note.trim() || null,
      license_plate: plate.trim().toUpperCase().slice(0, 12) || null,
    });
    setBusy(false);
    if (error) {
      if (created) await sb.from("customers").delete().eq("id", customerId);
      return setErr(error.code === "23P01" ? (error.message.includes("no_resource_double_booking") ? PLACE_FULL : "Diese Zeit ist bei der Person schon belegt.") : "Termin konnte nicht gespeichert werden.");
    }
    props.onCreated();
  }

  return (
    <Drawer onClose={props.onClose} title="Termin eintragen" eyebrow="Telefon oder Laufkundschaft">
      <form onSubmit={save} className="grid gap-3.5" noValidate>
        <div className="grid gap-1.5">
          <label htmlFor="c-customer" className="text-[13px] text-muted">Kunde</label>
          {customer ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm">
              <UserRound size={16} className="text-accent" />
              <span className="font-medium">{customer.name}</span>
              <span className="font-mono text-muted">{customer.phone}</span>
              <button type="button" className="ml-auto text-muted hover:text-fg" aria-label="Andere Person wählen" onClick={() => setCustomer(null)}><X size={16} /></button>
            </div>
          ) : (
            <div className="relative">
              <input id="c-customer" className="input input-sm" autoComplete="off" placeholder="Name oder Telefon suchen – oder neuen Namen eintragen" value={q} onChange={(e) => setQ(e.target.value)} />
              {found.length > 0 && q.trim().length >= 2 && (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 grid overflow-hidden rounded-xl border border-line-2 bg-card shadow-2xl">
                  {found.map((f) => (
                    <li key={f.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-fg/5" onClick={() => { setCustomer(f); setFound([]); }}>
                        <span>{f.name}</span>
                        <span className="font-mono text-xs text-muted">{f.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {!customer && <TextField id="c-phone" label="Telefon (neuer Kunde, optional)" type="tel" value={phone} onChange={setPhone} />}
        <Select id="c-service" label="Leistung" value={serviceId} onChange={setServiceId}
          options={props.services.map((s) => [s.id, `${s.name} · ${duration(s.duration_min)} · ${euro(priceWith(s, staffId, staffPrices))}`])} />
        <div className="grid grid-cols-2 gap-3">
          <TextField id="c-date" label="Datum" type="date" value={date} onChange={(v) => v && setDate(v)} />
          <Select id="c-staff" label="Bei" value={staffId} onChange={setStaffId} options={props.staff.map((s) => [s.id, s.name])} />
        </div>
        {service && (
          <SlotPicker id="c-time" salonId={props.salonId} tz={props.tz} step={props.step} date={date} staffId={staffId} durationMin={service.duration_min} resourceKind={service.resource_kind} value={min} onChange={setMin} />
        )}
        <TextField id="c-plate" label="Kennzeichen (optional)" value={plate} onChange={setPlate} />
        <TextField id="c-note" label="Hinweis (optional)" value={note} onChange={setNote} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy}><Plus size={18} /> {busy ? "Speichert …" : "Eintragen"}</button>
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>Abbrechen</button>
        </div>
      </form>
    </Drawer>
  );
}
