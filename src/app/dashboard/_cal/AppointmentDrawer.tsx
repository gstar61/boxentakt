"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, CalendarX2, RotateCcw, UserCheck, UserX } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { atLocal, euro, hm, longDate, zonedDate, zonedMinutes } from "@/lib/time";
import { Drawer, Row, Select, TextField } from "../ui";
import { notifyCustomer, notifyWaitlistForCancel } from "../actions";
import { SlotPicker } from "./SlotPicker";
import { PAYMENT_LABEL, STATUS_LABEL, type Appt, type Status } from "./data";

type Stats = { visits: number; no_shows: number; cancellations: number };

async function notify(id: string, kind: "cancelled" | "moved") {
  const { data } = await browserClient().auth.getSession();
  return data.session ? (await notifyCustomer(data.session.access_token, id, kind)).sent : false;
}

export function AppointmentDrawer(props: {
  appt: Appt;
  salonId: string;
  tz: string;
  step: number;
  staff: { id: string; name: string }[];
  onClose: () => void;
  onChanged: (message: string, err?: boolean) => void;
}) {
  const a = props.appt;
  const tz = props.tz;
  const hasEmail = Boolean(a.customer?.email);
  const [stats, setStats] = useState<Stats | null>(null);
  const [mail, setMail] = useState(true);
  const [moving, setMoving] = useState(false);
  const [move, setMove] = useState({ date: zonedDate(a.start, tz), staffId: a.staff_id, min: zonedMinutes(a.start, tz) as number | null });
  const [busy, setBusy] = useState(false);
  const durationMin = (a.end.getTime() - a.start.getTime()) / 60000;

  useEffect(() => {
    browserClient()
      .from("customer_stats")
      .select("visits,no_shows,cancellations")
      .eq("customer_id", a.customer_id)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => setStats(data as Stats | null));
  }, [a.customer_id]);

  async function setStatus(status: Status) {
    setBusy(true);
    const { error } = await browserClient().from("appointments").update({ status }).eq("id", a.id);
    if (error) {
      setBusy(false);
      return props.onChanged(error.code === "23P01" ? "Die Zeit ist inzwischen belegt." : "Speichern fehlgeschlagen.", true);
    }
    let text = `Status: ${STATUS_LABEL[status]}`;
    if (status === "storniert" && mail && hasEmail) text = (await notify(a.id, "cancelled")) ? "Storniert, Kunde per E-Mail informiert" : "Storniert (E-Mail nicht gesendet)";
    if (status === "storniert") {
      const { data } = await browserClient().auth.getSession();
      const told = data.session ? await notifyWaitlistForCancel(data.session.access_token, a.id) : 0;
      if (told) text += ` · ${told} von der Warteliste benachrichtigt`;
    }
    setBusy(false);
    props.onChanged(text);
  }

  async function saveMove() {
    if (move.min == null) return;
    setBusy(true);
    const start = atLocal(move.date, move.min, tz);
    const end = new Date(start.getTime() + durationMin * 60000);
    const { error } = await browserClient()
      .from("appointments")
      .update({ staff_id: move.staffId, during: `[${start.toISOString()},${end.toISOString()})`, reminder_sent_at: null })
      .eq("id", a.id);
    if (error) {
      setBusy(false);
      return props.onChanged(error.code === "23P01" ? "Diese Zeit ist bei der Person schon belegt." : "Verschieben fehlgeschlagen.", true);
    }
    let text = "Termin verschoben";
    if (mail && hasEmail) text = (await notify(a.id, "moved")) ? "Verschoben, Kunde per E-Mail informiert" : "Verschoben (E-Mail nicht gesendet)";
    setBusy(false);
    props.onChanged(text);
  }

  const statusBtn = (s: Status, icon: React.ReactNode, label: string, cls = "") => (
    <button className={`btn btn-sm ${cls}`} disabled={busy || a.status === s} onClick={() => setStatus(s)}>{icon} {label}</button>
  );

  return (
    <Drawer onClose={props.onClose} title={a.customer?.name ?? "Termin"} eyebrow={STATUS_LABEL[a.status]}>
      {stats && (
        <p className="text-sm text-muted">
          {stats.visits} {stats.visits === 1 ? "Besuch" : "Besuche"}
          {stats.no_shows > 0 && <span className="text-danger"> · {stats.no_shows}× nicht erschienen</span>}
          {stats.cancellations > 0 && <> · {stats.cancellations}× storniert</>}
        </p>
      )}
      <dl className="grid gap-2.5 rounded-[14px] border border-line bg-card-2 p-4 text-sm">
        <Row k="Termin" v={`${longDate(zonedDate(a.start, tz))}, ${hm(zonedMinutes(a.start, tz))}–${hm(zonedMinutes(a.end, tz))}`} />
        <Row k="Leistung" v={a.service_name} />
        <Row k="Bei" v={props.staff.find((s) => s.id === a.staff_id)?.name ?? ""} />
        <Row k="Preis" v={euro(a.price_cents)} />
        {a.deposit_cents && a.payment_status && <Row k="Anzahlung" v={`${euro(a.deposit_cents)} ${PAYMENT_LABEL[a.payment_status]}`} />}
        <Row k="Telefon" v={a.customer?.phone ?? "–"} copy={a.customer?.phone ?? undefined} />
        {a.customer?.email && <Row k="E-Mail" v={a.customer.email} />}
        <Row k="Gebucht über" v={a.source === "online" ? "Online" : "Salon"} />
        {a.note && <Row k="Hinweis" v={a.note} />}
        {a.customer?.note && <Row k="Kundennotiz" v={a.customer.note} />}
      </dl>

      {moving ? (
        <div className="grid gap-3 rounded-[14px] border border-line p-4">
          <span className="label">Verschieben</span>
          <div className="grid grid-cols-2 gap-3">
            <TextField id="m-date" label="Datum" type="date" value={move.date} onChange={(v) => v && setMove({ ...move, date: v })} />
            <Select id="m-staff" label="Bei" value={move.staffId} onChange={(v) => setMove({ ...move, staffId: v })} options={props.staff.map((s) => [s.id, s.name])} />
          </div>
          <SlotPicker id="m-time" salonId={props.salonId} tz={tz} step={props.step} date={move.date} staffId={move.staffId} durationMin={durationMin} ignoreId={a.id} value={move.min} onChange={(min) => setMove({ ...move, min })} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy || move.min == null} onClick={saveMove}><ArrowRightLeft size={16} /> Verschieben</button>
            <button className="btn btn-ghost" onClick={() => setMoving(false)}>Abbrechen</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2.5">
          <span className="label">Status</span>
          <div className="flex flex-wrap gap-2">
            {statusBtn("erschienen", <UserCheck size={16} />, "Erschienen")}
            {statusBtn("nicht_erschienen", <UserX size={16} />, "Nicht erschienen")}
            {statusBtn("gebucht", <RotateCcw size={16} />, "Zurücksetzen")}
            {a.status !== "storniert" && (
              <button className="btn btn-sm" disabled={busy} onClick={() => setMoving(true)}><ArrowRightLeft size={16} /> Verschieben</button>
            )}
            {statusBtn("storniert", <CalendarX2 size={16} />, "Stornieren", "btn-danger")}
          </div>
        </div>
      )}
      {hasEmail && a.status !== "storniert" && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="size-4 accent-accent" checked={mail} onChange={(e) => setMail(e.target.checked)} />
          Bei Storno oder Verschieben Kunden per E-Mail informieren
        </label>
      )}
    </Drawer>
  );
}
