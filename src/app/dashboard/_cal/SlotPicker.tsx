"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, atLocal, freeSlots, hm, placeGroups, weekday, type Busy, type ResourceBusy } from "@/lib/time";
import { busyFor, busyPlaces, loadRange } from "./data";
import { useSalon, type ResourceKind } from "../salon-context";

const NO_PLACES: ResourceBusy[] = [];

/** Free start times (06:00–22:00) for one person on one day, ignoring opening hours on purpose. */
export function SlotPicker(props: {
  id: string;
  salonId: string;
  tz: string;
  step: number;
  date: string;
  staffId: string;
  durationMin: number;
  ignoreId?: string;
  /** Arten der benötigten Plätze (z. B. Hebebühne + Wuchtmaschine); leer = keine Platzprüfung */
  resourceKinds?: ResourceKind[];
  value: number | null;
  onChange: (min: number | null) => void;
}) {
  const key = `${props.date}|${props.staffId}`;
  const { resources, salon } = useSalon();
  const [busy, setBusy] = useState<{ key: string; list: Busy[]; places: ResourceBusy[] } | null>(null);

  useEffect(() => {
    let live = true;
    loadRange(props.salonId, atLocal(props.date, 0, props.tz), atLocal(addDays(props.date, 1), 0, props.tz))
      .then(({ appts, absences, blocks }) => live && setBusy({ key, list: busyFor(appts, absences, [props.staffId], props.ignoreId), places: busyPlaces(appts, props.ignoreId, blocks) }))
      .catch(() => live && setBusy({ key, list: [], places: [] }));
    return () => {
      live = false;
    };
  }, [key, props.salonId, props.date, props.tz, props.staffId, props.ignoreId]);

  const list = busy?.key === key ? busy.list : null;
  const groups = placeGroups(resources, props.resourceKinds ?? []);
  const placeKey = groups.map((g) => g.join(",")).join(";");
  const byPlace = salon.planning !== "mitarbeiter";
  const placesBusy = busy?.key === key ? busy.places : NO_PLACES;
  const options = useMemo(() => {
    if (!list) return [];
    const allDay = [{ weekday: weekday(props.date), opens: "06:00", closes: "22:00" }];
    return freeSlots({ date: props.date, tz: props.tz, hours: allDay, step: props.step, durationMin: props.durationMin, staffIds: [props.staffId], busy: list, now: new Date(0), resources: placeKey ? { groups: placeKey.split(";").map((g) => g.split(",")), busy: placesBusy, byPlace } : undefined });
  }, [list, placesBusy, placeKey, byPlace, props.date, props.tz, props.step, props.durationMin, props.staffId]);

  // keep the selection valid when date, person or service changes
  const valid = props.value != null && options.some((o) => o.min === props.value);

  return (
    <div className="grid gap-1.5">
      <label htmlFor={props.id} className="text-[13px] text-muted">Uhrzeit</label>
      <select
        id={props.id}
        className="input input-sm font-mono"
        disabled={!list}
        value={valid ? String(props.value) : ""}
        onChange={(e) => props.onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{!list ? "Lädt …" : options.length ? "Bitte wählen" : "Nichts frei"}</option>
        {options.map((o) => (
          <option key={o.min} value={o.min}>{hm(o.min)}</option>
        ))}
      </select>
    </div>
  );
}
