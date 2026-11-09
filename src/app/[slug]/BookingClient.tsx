"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, BellPlus, Gift, CalendarCheck2, CalendarPlus, CalendarX2, Check, Clock3, Info, MapPin, Navigation, Phone, Plus } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import { addDays, duration, euro, euroFrom, dayHours, dayNote, freeSlots, groupDays, fullDateTime, hm, longDate, shortDay, shortMonth, weekday, zonedDate, type Busy } from "@/lib/time";
import { bookAction, joinWaitlistAction } from "../actions";
import { Field } from "@/components/Field";
import { LogoMark } from "@/components/Logo";
import { LegalFooter } from "@/components/LegalPage";
import type { Booked } from "@/lib/mail";
import type { PublicSalon } from "@/lib/salon";


type VehicleClass = "pkw" | "suv" | "transporter";
const CLASS_LABEL: Record<VehicleClass, string> = { pkw: "Pkw", suv: "SUV / Geländewagen", transporter: "Transporter / Bus" };
const PLATE = /^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 -]{2,11}$/;
const normalizePlate = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** Deposit in cents for a price, same rule as book_appointment (min. 0,50 €). */
const depositFor = (priceCents: number, percent: number) => (percent > 0 ? Math.max(Math.round((priceCents * percent) / 100), 50) : 0);

/** Price with a given person (Meister und Geselle können verschieden abrechnen). */
const priceOf = (s: Service, staffId: string | null) => (staffId ? s.staff_prices?.[staffId] : undefined) ?? s.price_cents;

export default function BookingClient({ salon, aborted, initialDay, initialService, vouchers }: { salon: PublicSalon; aborted?: boolean; initialDay?: string; initialService?: string; vouchers?: boolean }) {
  const tz = salon.timezone;
  const today = zonedDate(new Date(), tz);
  const days = useMemo(
    () => Array.from({ length: Math.min(salon.booking_days, 42) }, (_, i) => addDays(today, i)),
    [today, salon.booking_days],
  );
  const [serviceIds, setServiceIds] = useState<string[]>(() => (salon.services.some((s) => s.id === initialService) ? [initialService!] : []));
  const [staffId, setStaffId] = useState<string>("any");
  const [date, setDate] = useState(() => (initialDay && days.includes(initialDay) ? initialDay : (days.find((d) => dayHours(salon.hours, d, salon).length) ?? today)));
  const [reload, setReload] = useState(0);
  const [busyState, setBusyState] = useState<{ key: string; list: Busy[] } | null>(null);
  const busyKey = `${date}|${reload}`;
  const busy = busyState?.key === busyKey ? busyState.list : null;
  const [startIso, setStartIso] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [vehicle, setVehicle] = useState<{ plate: string; cls: VehicleClass; info: string }>({ plate: "", cls: "pkw", info: "" });
  const extra = salon.class_extra[vehicle.cls] ?? { min: 0, cents: 0 };
  const [error, setError] = useState<string | null>(aborted ? "Die Anzahlung wurde abgebrochen, der Termin ist nicht gebucht. Sie können eine neue Zeit wählen." : null);
  const [done, setDone] = useState<Booked | null>(null);
  const [pending, start] = useTransition();
  const [openedAt] = useState(() => Date.now());
  const [trap, setTrap] = useState("");
  const [terms, setTerms] = useState(false);

  // several services in one appointment: durations and (per person) prices add up
  const chosen = serviceIds.map((id) => salon.services.find((s) => s.id === id)).filter((s): s is Service => !!s);
  const service: Service | undefined = chosen.length
    ? {
        id: chosen[0].id,
        name: chosen.map((s) => s.name).join(" + "),
        // Fahrzeugklasse: Zuschlag in Minuten und Cent einmal je Termin
        duration_min: chosen.reduce((n, s) => n + s.duration_min, 0) + extra.min,
        price_cents: chosen.reduce((n, s) => n + s.price_cents, 0) + extra.cents,
        staff_prices: Object.fromEntries(salon.staff.map((st) => [st.id, chosen.reduce((n, s) => n + priceOf(s, st.id), 0) + extra.cents])),
      }
    : undefined;

  useEffect(() => {
    let live = true;
    const from = new Date(`${date}T00:00:00Z`);
    from.setUTCHours(from.getUTCHours() - 14);
    const to = new Date(from.getTime() + 52 * 3600_000);
    browserClient()
      .rpc("busy_intervals", { p_slug: salon.slug, p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data }: { data: unknown }) => {
        if (live) setBusyState({ key: `${date}|${reload}`, list: (data as Busy[]) ?? [] });
      });
    return () => {
      live = false;
    };
  }, [date, salon.slug, reload]);

  const totalMin = service?.duration_min ?? 0;
  // React Compiler memoizes this; a manual useMemo trips over the derived service object
  const slots = !totalMin || !busy ? [] : freeSlots({
      date,
      tz,
      hours: salon.hours,
      step: salon.slot_step,
      durationMin: totalMin,
      staffIds: staffId === "any" ? salon.staff.map((s) => s.id) : [staffId],
      busy,
      closures: salon,
    });
  const picked = slots.find((s) => s.start.toISOString() === startIso);
  const nextOpen = days.find((d) => d > date && dayHours(salon.hours, d, salon).length > 0);
  /** cheapest price among the people the customer can get */
  const minPrice = (s: Service) => (staffId !== "any" ? priceOf(s, staffId) : Math.min(s.price_cents, ...salon.staff.map((st) => priceOf(s, st.id))));
  const varies = !!service && new Set(salon.staff.map((st) => priceOf(service, st.id))).size > 1;
  /** "ab" only when the price really depends on who does it and nobody is chosen yet */
  const shownPrice = (s: Service) => {
    const fixed = staffId !== "any" || new Set(salon.staff.map((st) => priceOf(s, st.id))).size <= 1;
    return fixed ? euro(minPrice(s)) : euroFrom(minPrice(s));
  };
  const price = service ? priceOf(service, picked?.staffId ?? (staffId === "any" ? null : staffId)) : 0;
  const deposit = service ? depositFor(price, salon.deposit_percent) : 0;

  // on phones the next step sits below the fold: bring it into view after each choice
  const reveal = (id: string) =>
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  function toggleService(id: string) {
    setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 4 ? ids : [...ids, id]));
    setStartIso(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !picked) return;
    setError(null);
    if (form.name.trim().length < 2) return setError("Bitte den vollständigen Namen eintragen.");
    if (form.phone.replace(/\D/g, "").length < 6) return setError("Bitte eine Telefonnummer eintragen, damit die Werkstatt Sie erreicht.");
    if (!PLATE.test(normalizePlate(vehicle.plate))) return setError("Bitte das Kennzeichen eintragen, z. B. MA-AB 123.");
    if (deposit && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setError("Für die Anzahlung bitte eine E-Mail-Adresse angeben.");
    if (deposit && !terms) return setError("Bitte den Stornobedingungen zustimmen.");
    start(async () => {
      const res = await bookAction({
        slug: salon.slug,
        serviceIds: chosen.map((s) => s.id),
        // with prices per person, book exactly the person whose price was shown
        staffId: staffId !== "any" ? staffId : varies ? picked.staffId : null,
        start: picked.start.toISOString(),
        ...form,
        plate: normalizePlate(vehicle.plate),
        vehicleClass: vehicle.cls,
        vehicleInfo: vehicle.info,
        website: trap,
        acceptedTerms: terms,
        elapsedMs: Date.now() - openedAt,
      });
      if (res.ok && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else if (res.ok) {
        setDone(res.booking);
        setForm({ name: "", phone: "", email: "", note: "" });
        setVehicle((v) => ({ ...v, plate: "", info: "" }));
      } else {
        setError(res.message);
        if (res.code === "slot_taken") {
          setStartIso(null);
          setReload((n) => n + 1);
        }
      }
    });
  }

  const logo = salon.logo_url ? (
    <Image src={salon.logo_url} alt={`Logo ${salon.name}`} width={160} height={160} className="size-full object-cover" />
  ) : (
    <LogoMark size={salon.cover_url ? 26 : 18} />
  );
  const contact = (
    <div>
      <div className="font-semibold tracking-tight">{salon.name}</div>
      {salon.address && (
        <div className="flex items-center gap-1 text-xs text-muted">
          <MapPin size={12} /> {salon.address}
        </div>
      )}
    </div>
  );
  const phone = salon.phone && (
    <a href={`tel:${salon.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-sm text-muted hover:text-fg">
      <Phone size={14} /> {salon.phone}
    </a>
  );
  const header = salon.cover_url ? (
    <header className="grid gap-4">
      <div className="relative">
        <div className="relative aspect-[5/2] max-h-[300px] w-full overflow-hidden rounded-[22px] border border-line bg-card-2">
          <Image src={salon.cover_url} alt={`${salon.name} von innen`} fill priority sizes="(max-width: 1100px) 100vw, 1060px" className="object-cover" />
        </div>
        <span className="absolute -bottom-8 left-5 grid size-20 place-items-center overflow-hidden rounded-2xl border-4 border-bg bg-card text-accent shadow-lg sm:left-7 sm:size-24">
          {logo}
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 pt-9 sm:min-h-14 sm:pt-1 sm:pl-[144px]">
        <div>
          <div className="text-xl font-semibold tracking-tight sm:text-2xl">{salon.name}</div>
          {salon.address && (
            <div className="flex items-center gap-1 text-sm text-muted">
              <MapPin size={13} /> {salon.address}
            </div>
          )}
        </div>
        {phone}
      </div>
    </header>
  ) : (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className={`grid place-items-center overflow-hidden rounded-xl ${salon.logo_url ? "size-12 border border-line" : "size-10 border border-accent/25 bg-accent/10 text-accent"}`}>
          {logo}
        </span>
        {contact}
      </div>
      {phone}
    </header>
  );

  if (done) {
    return (
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6">
        {header}
        <section className="card grid max-w-xl gap-6 p-8">
          <span className="grid size-13 place-items-center rounded-2xl bg-accent/10 text-accent">
            <CalendarCheck2 size={26} strokeWidth={1.75} />
          </span>
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold">Termin ist gebucht</h1>
            <p className="text-muted">
              {done.service_name} bei {done.staff_name}
              <br />
              {fullDateTime(done.starts_at, tz)}
            </p>
            <p className="text-sm text-muted">
              Wenn Sie eine E-Mail-Adresse angegeben haben, kommt gleich eine Bestätigung mit Link zum Absagen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => downloadIcs(done, salon)}>
              <CalendarPlus size={18} /> In den Kalender
            </button>
            <a className="btn" href={googleCalendarUrl(done, salon)} target="_blank" rel="noreferrer">
              Google Kalender
            </a>
            <button className="btn btn-ghost" onClick={() => { setDone(null); setStartIso(null); setServiceIds([]); setReload((n) => n + 1); }}>
              <Plus size={18} /> Weiteren Termin buchen
            </button>
          </div>
        </section>
        <LegalFooter slug={salon.slug} />
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6">
      {header}
      <div className="grid max-w-2xl gap-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">Termin buchen</h1>
        <p className="text-muted">Leistung wählen, Zeit aussuchen, Namen eintragen. Ohne Konto.</p>
      </div>
      {salon.notice && (
        <p className="flex max-w-3xl items-start gap-2.5 rounded-[14px] border border-line bg-card-2 px-4 py-3 text-sm text-muted">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" /> {salon.notice}
        </p>
      )}

      {!salon.bookable ? (
        <p className="empty max-w-2xl">
          <Info size={18} className="shrink-0" /> Online-Buchung ist gerade nicht verfügbar.{salon.phone ? ` Termine gerne telefonisch unter ${salon.phone}.` : ""}
        </p>
      ) : (
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.15fr]">
        <Step n={1} title="Leistung" active={!service}>
          {salon.services.length === 0 ? <p className="empty">Noch keine Leistungen eingetragen.</p> : <p className="-mt-1 text-[13px] text-muted">Auch mehrere möglich, z. B. Räderwechsel und Bremsencheck.</p>}
          <div className="grid gap-5">
            {groupServices(salon.services).map((g) => (
              <div key={g.title ?? "all"} className="grid gap-2">
                {g.title && <span className="label">{g.title}</span>}
                {g.items.map(({ s, label }) => (
                  <button
                    key={s.id}
                    aria-pressed={serviceIds.includes(s.id)}
                    onClick={() => toggleService(s.id)}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-[14px] border border-line bg-card-2 px-4 py-3.5 text-left transition hover:-translate-y-px hover:border-line-2 aria-pressed:border-accent aria-pressed:bg-accent/10"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="row-span-2 font-medium tabular-nums">{shownPrice(s)}</span>
                    <span className="flex items-center gap-1.5 text-[13px] text-muted">
                      <Clock3 size={14} /> {duration(s.duration_min)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <span className="label">Fahrzeug</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CLASS_LABEL) as VehicleClass[]).map((c) => {
                const x = salon.class_extra[c];
                return (
                  <button key={c} type="button" className="pill" aria-pressed={vehicle.cls === c} onClick={() => { setVehicle({ ...vehicle, cls: c }); setStartIso(null); }}>
                    {CLASS_LABEL[c]}
                    {x && (x.min > 0 || x.cents > 0) && <span className="ml-1.5 tabular-nums opacity-70">+{x.min > 0 ? duration(x.min) : ""}{x.min > 0 && x.cents > 0 ? " · " : ""}{x.cents > 0 ? euro(x.cents) : ""}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {service && (
            <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-[14px] border border-accent/30 bg-card px-4 py-3 shadow-lg lg:static lg:shadow-none">
              <div className="min-w-0 text-sm">
                <div className="font-medium">{chosen.length === 1 ? "1 Leistung" : `${chosen.length} Leistungen`} · {duration(service.duration_min)}</div>
                <div className="text-muted tabular-nums">{shownPrice(service)}{chosen.length < 4 && <span className="hidden sm:inline"> · weitere hinzufügen möglich</span>}</div>
              </div>
              <button className="btn btn-primary btn-sm shrink-0 lg:hidden" onClick={() => reveal("schritt-wann")}>Zeit wählen</button>
            </div>
          )}
        </Step>

        <div className="grid min-w-0 gap-5">
          <Step id="schritt-wann" n={2} title="Wann" active={!!service && !picked}>
            <div className="grid gap-2">
              <span className="label">Bei wem</span>
              <div className="flex flex-wrap gap-2">
                {[{ id: "any", name: "Egal, wer frei ist" }, ...salon.staff].map((s) => (
                  <button key={s.id} className="pill" aria-pressed={staffId === s.id} onClick={() => { setStaffId(s.id); setStartIso(null); }}>
                    {s.name}
                    {varies && service && s.id !== "any" && <span className="ml-1.5 tabular-nums opacity-70">{euro(priceOf(service, s.id))}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <span className="label">Tag</span>
              <div className="flex snap-x gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,#000_88%,transparent)] [&>*]:snap-start">
                {days.map((d) => {
                  const open = dayHours(salon.hours, d, salon).length > 0;
                  const note = dayNote(d, salon);
                  return (
                    <button
                      key={d}
                      disabled={!open}
                      aria-pressed={d === date}
                      title={note ?? undefined}
                      aria-label={longDate(d) + (note ? ` (${note})` : open ? "" : " (geschlossen)")}
                      onClick={() => { setDate(d); setStartIso(null); }}
                      className="grid w-[62px] flex-none justify-items-center gap-0.5 rounded-xl border border-line bg-card-2 py-2.5 disabled:cursor-not-allowed disabled:opacity-35 aria-pressed:border-accent aria-pressed:bg-accent/10"
                    >
                      <span className="text-[11px] uppercase tracking-wider text-muted">{d === today ? "Heute" : shortDay(d)}</span>
                      <span className="font-mono text-lg font-semibold">{Number(d.slice(8))}</span>
                      <span className={`text-[11px] ${note && open ? "text-accent" : "text-muted"}`}>{note && open ? "Sonder" : shortMonth(d)}</span>
                    </button>
                  );
                })}
              </div>
              {dayNote(date, salon) && (
                <p className="flex items-center gap-1.5 text-[13px] text-muted"><Info size={14} className="text-accent" /> {longDate(date)}: {dayNote(date, salon)}</p>
              )}
            </div>
            <div className="grid gap-2">
              <span className="label">Uhrzeit</span>
              {!service ? (
                <p className="empty"><ArrowLeft size={18} /> Erst eine Leistung wählen, dann erscheinen die freien Zeiten.</p>
              ) : busy === null ? (
                <p className="empty">Freie Zeiten werden geladen …</p>
              ) : slots.length === 0 ? (
                <div className="grid gap-3">
                  <div className="empty flex-wrap items-center">
                    <CalendarX2 size={18} /> An diesem Tag ist für {duration(service.duration_min)} nichts mehr frei.
                    {nextOpen && (
                      <button type="button" className="btn btn-sm ml-auto" onClick={() => { setDate(nextOpen); setStartIso(null); }}>
                        {shortDay(nextOpen)} {Number(nextOpen.slice(8))}. ansehen
                      </button>
                    )}
                  </div>
                  {dayHours(salon.hours, date, salon).length > 0 && (
                    <WaitlistForm key={`${date}|${service.id}`} slug={salon.slug} day={date} serviceId={service.id} staffId={staffId === "any" ? null : staffId} />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
                  {slots.map((s) => {
                    const iso = s.start.toISOString();
                    return (
                      <button
                        key={iso}
                        aria-pressed={iso === startIso}
                        onClick={() => { setStartIso(iso); reveal("schritt-kontakt"); }}
                        className="h-[42px] rounded-[11px] border border-line-2 font-mono text-sm tabular-nums hover:border-accent hover:text-accent aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-ink"
                      >
                        {hm(s.min)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Step>

          <Step id="schritt-kontakt" n={3} title="Kontakt" active={!!picked}>
            {!picked || !service ? (
              <p className="text-sm text-muted">Nach der Zeitwahl hier Namen und Telefonnummer eintragen.</p>
            ) : (
              <>
                <dl className="grid gap-2.5 rounded-[14px] border border-line bg-card-2 p-4 text-sm">
                  <Row k={chosen.length > 1 ? "Leistungen" : "Leistung"} v={service.name} />
                  <Row k="Termin" v={`${longDate(date)}, ${hm(picked.min)}–${hm(picked.min + service.duration_min)}`} />
                  <Row k="Fahrzeug" v={CLASS_LABEL[vehicle.cls]} />
                  <Row k="Bei" v={salon.staff.find((s) => s.id === picked.staffId)?.name ?? ""} />
                  <Row k="Preis" v={euro(price)} mono />
                  {deposit > 0 && <Row k="Anzahlung jetzt" v={euro(deposit)} mono />}
                </dl>
                <form onSubmit={submit} noValidate className="grid max-w-md gap-3.5">
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute -left-[9999px] size-px opacity-0"
                    value={trap}
                    onChange={(e) => setTrap(e.target.value)}
                  />
                  <Field id="name" label="Name" autoComplete="name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                  <Field id="plate" label="Kennzeichen" autoComplete="off" value={vehicle.plate} onChange={(v) => setVehicle({ ...vehicle, plate: v.toUpperCase() })} />
                  <Field id="vehicle" label="Fahrzeug, z. B. VW Golf 7 (optional)" autoComplete="off" value={vehicle.info} onChange={(v) => setVehicle({ ...vehicle, info: v })} />
                  <Field id="phone" label="Telefon" type="tel" autoComplete="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                  <Field id="email" label={deposit ? "E-Mail (für Bestätigung und Beleg)" : "E-Mail (für Bestätigung, optional)"} type="email" autoComplete="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                  <div className="grid gap-1.5">
                    <label htmlFor="note" className="text-[13px] text-muted">Hinweis (optional)</label>
                    <textarea id="note" className="input" maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="z. B. Reifengröße, Geräusch beim Bremsen" />
                  </div>
                  {deposit > 0 && (
                    <label className="flex items-start gap-3 rounded-[14px] border border-line bg-card-2 p-3.5 text-[13px] leading-relaxed text-muted">
                      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                      <span>
                        Ich zahle jetzt {euro(deposit)} an, die mit dem Endpreis verrechnet werden. Bei Absage bis 24 Stunden vorher wird die Anzahlung
                        automatisch erstattet. Bei späterer Absage oder Nichterscheinen behält die Werkstatt sie als Ausfallpauschale; der Nachweis, dass kein
                        oder ein geringerer Schaden entstanden ist, bleibt mir vorbehalten.
                      </span>
                    </label>
                  )}
                  {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                  <p className="text-xs text-dim">
                    Der Endpreis richtet sich nach dem tatsächlichen Aufwand (z. B. zusätzliche Arbeiten oder Teile). Mit der Buchung werden Name, Kontaktdaten und Kennzeichen zur Terminverwaltung bei der Werkstatt gespeichert. Mit E-Mail-Adresse bekommen Sie ggf. eine Bitte um Bewertung und eine Erinnerung an den nächsten Termin; abmelden geht jederzeit per Link in der Mail.
                    {deposit > 0 && " Die Zahlung läuft über Stripe direkt an die Werkstatt."}
                  </p>
                  <div>
                    <button type="submit" className="btn btn-primary" disabled={pending}>
                      <Check size={18} /> {pending ? "Wird gebucht …" : deposit ? `Weiter zur Anzahlung (${euro(deposit)})` : "Termin verbindlich buchen"}
                    </button>
                  </div>
                </form>
              </>
            )}
            {error && !picked && <p role="alert" className="text-sm text-danger">{error}</p>}
          </Step>
        </div>
      </div>
      )}
      <SalonInfo salon={salon} today={today} vouchers={vouchers} />
      <LegalFooter slug={salon.slug} />
    </main>
  );
}

function Step({ id, n, title, active, children }: { id?: string; n: number; title: string; active: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className="card grid scroll-mt-4 gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-6 place-items-center rounded-lg font-mono text-xs font-semibold ${active ? "bg-accent text-accent-ink" : "bg-fg/5 text-muted"}`}>{n}</span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${mono ? "tabular-nums" : ""}`}>{v}</dd>
    </div>
  );
}

type Service = PublicSalon["services"][number];

/** Groups "Damen · Schnitt", "Herren · Bart" … by the part before " · " when at least two groups come out of it. */
function groupServices(list: Service[]) {
  const prefix = (s: Service) => (s.name.includes(" · ") ? s.name.split(" · ")[0] : null);
  const counts = new Map<string, number>();
  list.forEach((s) => { const p = prefix(s); if (p) counts.set(p, (counts.get(p) ?? 0) + 1); });
  const keys = [...counts].filter(([, n]) => n >= 2).map(([k]) => k);
  if (!keys.length) return [{ title: null as string | null, items: list.map((s) => ({ s, label: s.name })) }];
  const groups = keys.map((k) => ({ title: k as string | null, items: list.filter((s) => prefix(s) === k).map((s) => ({ s, label: s.name.slice(k.length + 3) })) }));
  const rest = list.filter((s) => !keys.includes(prefix(s) ?? ""));
  return rest.length ? [...groups, { title: "Weitere Leistungen", items: rest.map((s) => ({ s, label: s.name })) }] : groups;
}

const DAY_NAMES = [[1, "Montag"], [2, "Dienstag"], [3, "Mittwoch"], [4, "Donnerstag"], [5, "Freitag"], [6, "Samstag"], [0, "Sonntag"]] as const;

/** Opening hours of the week, address with route link and phone. */
function SalonInfo({ salon, today, vouchers }: { salon: PublicSalon; today: string; vouchers?: boolean }) {
  const todayDow = weekday(today);
  const maps = salon.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${salon.name}, ${salon.address}`)}` : null;
  return (
    <section className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
      <div className="card grid content-start gap-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Clock3 size={16} className="text-muted" /> Öffnungszeiten</h2>
        <dl className="grid gap-1.5 text-sm">
          {DAY_NAMES.map(([d, name]) => {
            const iv = salon.hours.filter((h) => h.weekday === d).sort((a, b) => a.opens.localeCompare(b.opens));
            const isToday = d === todayDow;
            return (
              <div key={d} className={`flex justify-between gap-4 rounded-lg px-2 py-1 ${isToday ? "bg-accent/10" : ""}`}>
                <dt className={isToday ? "font-medium" : "text-muted"}>{name}{isToday && <span className="ml-2 text-xs text-accent">Heute</span>}</dt>
                <dd className={`text-right tabular-nums ${iv.length ? "" : "text-dim"}`}>{iv.length ? iv.map((h) => `${h.opens}–${h.closes}`).join(", ") : "geschlossen"}</dd>
              </div>
            );
          })}
        </dl>
        {(() => {
          const rows = groupDays([
            ...salon.special_days,
            ...salon.holidays.filter((h) => !salon.special_days.some((d) => d.day === h.day)).map((h) => ({ day: h.day, opens: null, closes: null, note: h.name })),
          ]).slice(0, 6);
          const label = (d: string) => `${shortDay(d)}, ${Number(d.slice(8))}. ${shortMonth(d)}`;
          return rows.length ? (
            <div className="grid gap-1.5 border-t border-line pt-3 text-sm">
              <span className="label">Abweichende Zeiten</span>
              {rows.map((r) => (
                <div key={r.from} className="flex justify-between gap-4 px-2">
                  <span className="text-muted">{r.from === r.to ? label(r.from) : `${label(r.from)} – ${label(r.to)}`}{r.note ? ` · ${r.note}` : ""}</span>
                  <span className="text-right tabular-nums">{r.opens ? `${r.opens}–${r.closes}` : "geschlossen"}</span>
                </div>
              ))}
            </div>
          ) : null;
        })()}
      </div>
      <div className="card grid content-start gap-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><MapPin size={16} className="text-muted" /> So finden Sie uns</h2>
        <div className="grid gap-1 text-sm">
          <span className="font-medium">{salon.name}</span>
          {salon.address && <span className="text-muted">{salon.address}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {maps && <a className="btn btn-sm" href={maps} target="_blank" rel="noreferrer"><Navigation size={15} /> Route planen</a>}
          {vouchers && <a className="btn btn-sm" href={`/${salon.slug}/gutschein`}><Gift size={15} /> Gutschein verschenken</a>}
          {salon.phone && <a className="btn btn-sm" href={`tel:${salon.phone.replace(/[^\d+]/g, "")}`}><Phone size={15} /> Anrufen</a>}
        </div>
      </div>
    </section>
  );
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const endOf = (b: Booked, salon: PublicSalon) =>
  b.ends_at ?? new Date(Date.parse(b.starts_at) + (salon.services.find((s) => s.name === b.service_name)?.duration_min ?? 60) * 60_000).toISOString();

/** Calendar file for Apple/Outlook/Android with the cancel link in the notes. */
function downloadIcs(b: Booked, salon: PublicSalon) {
  const esc = (t: string) => t.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const cancel = `${location.origin}/storno/${b.cancel_token}`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Boxentakt//DE", "BEGIN:VEVENT",
    `UID:${b.cancel_token}@boxentakt.de`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(b.starts_at)}`, `DTEND:${icsDate(endOf(b, salon))}`,
    `SUMMARY:${esc(`${b.service_name} – ${salon.name}`)}`,
    ...(salon.address ? [`LOCATION:${esc(salon.address)}`] : []),
    `DESCRIPTION:${esc(`Bei ${b.staff_name}. Absagen: ${cancel}`)}`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Werkstatttermin", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  a.download = "termin.ics";
  a.click();
  URL.revokeObjectURL(a.href);
}

function googleCalendarUrl(b: Booked, salon: PublicSalon) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.service_name} – ${salon.name}`,
    dates: `${icsDate(b.starts_at)}/${icsDate(endOf(b, salon))}`,
    details: `Bei ${b.staff_name}`,
    location: salon.address ?? "",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** "Notify me if something opens up" for a fully booked day. */
function WaitlistForm({ slug, day, serviceId, staffId }: { slug: string; day: string; serviceId: string; staffId: string | null }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [state, setState] = useState<{ done?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  if (state.done)
    return (
      <p className="flex items-start gap-2.5 rounded-[14px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
        <Check size={16} className="mt-0.5 shrink-0 text-accent" /> Sie stehen auf der Warteliste für {longDate(day)}. Wird etwas frei, bekommen Sie sofort eine E-Mail.
      </p>
    );
  if (!open)
    return (
      <button type="button" className="btn w-fit" onClick={() => setOpen(true)}>
        <BellPlus size={17} /> Auf die Warteliste für {shortDay(day)} {Number(day.slice(8))}.
      </button>
    );
  return (
    <form
      className="grid gap-3 rounded-[14px] border border-line bg-card-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await joinWaitlistAction({ slug, serviceId, staffId, day, ...f });
          setState(r.ok ? { done: true } : { error: r.message });
        });
      }}
    >
      <p className="text-sm text-muted">Sagt jemand für {longDate(day)} ab, schicken wir Ihnen eine E-Mail. Wer zuerst bucht, bekommt den Termin.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input input-sm" placeholder="Name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input input-sm" type="email" placeholder="E-Mail" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button className="btn btn-sm w-fit" disabled={pending}>{pending ? "Wird eingetragen …" : "Benachrichtigen, wenn frei"}</button>
    </form>
  );
}
