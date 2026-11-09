"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ChartNoAxesColumn, ExternalLink, LogOut, QrCode, SlidersHorizontal, UsersRound } from "lucide-react";
import { browserClient } from "@/lib/supabase";
import type { Holiday, Hours, SpecialDay } from "@/lib/time";
import { SalonContext, type SalonCtx, type Salon, type Service, type Staff, type StaffPrice, type Resource } from "./salon-context";
import { Onboarding } from "./Onboarding";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/Logo";
import { TrialBanner } from "./TrialBanner";
import { FeedbackButton } from "./Feedback";

const KEY = "boxentakt.salon";
const remembered = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Date range for holidays and special days shown in the calendar: two months back, a bit over a year ahead. */
const closureWindow = () => [-62, 400].map((d) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10));

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ctx, setCtx] = useState<SalonCtx | null>(null);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "nosalon">("loading");
  const [user, setUser] = useState<{ id: string; email: string; meta: Record<string, string> } | null>(null);

  const load = useCallback(async (pick?: string) => {
    const sb = browserClient();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) return router.replace("/login");
    setUser({ id: auth.user.id, email: auth.user.email ?? "", meta: (auth.user.user_metadata ?? {}) as Record<string, string> });
    await sb.rpc("claim_salons");
    const { data } = await sb.from("salons").select("*").order("created_at");
    const list = (data ?? []) as Salon[];
    setSalons(list);
    const want = pick ?? remembered();
    const salon = list.find((s) => s.id === want) ?? list[0];
    if (!salon) return setState("nosalon");
    try {
      localStorage.setItem(KEY, salon.id);
    } catch {}
    const [from, to] = closureWindow();
    const [st, sv, h, m, sp, sd, hol, rs] = await Promise.all([
      sb.from("staff").select("*").eq("salon_id", salon.id).order("sort"),
      sb.from("services").select("*").eq("salon_id", salon.id).order("sort"),
      sb.from("opening_hours").select("weekday,opens,closes").eq("salon_id", salon.id),
      sb.from("salon_members").select("role").eq("salon_id", salon.id).eq("user_id", auth.user.id).maybeSingle(),
      sb.from("staff_prices").select("staff_id,service_id,price_cents").eq("salon_id", salon.id),
      sb.from("special_days").select("day,opens,closes,note").eq("salon_id", salon.id).gte("day", from).order("day"),
      salon.holiday_state ? sb.rpc("public_holidays", { p_state: salon.holiday_state, p_from: from, p_to: to }) : Promise.resolve({ data: [] }),
      sb.from("resources").select("*").eq("salon_id", salon.id).order("sort"),
    ]);
    const hours = ((h.data ?? []) as { weekday: number; opens: string; closes: string }[]).map((x) => ({
      weekday: x.weekday,
      opens: x.opens.slice(0, 5),
      closes: x.closes.slice(0, 5),
    })) as Hours[];
    setCtx({
      salon,
      staff: (st.data ?? []) as Staff[],
      services: (sv.data ?? []) as Service[],
      resources: (rs.data ?? []) as Resource[],
      staffPrices: (sp.data ?? []) as StaffPrice[],
      hours,
      closures: {
        holidays: (hol.data ?? []) as Holiday[],
        special_days: ((sd.data ?? []) as SpecialDay[]).map((d) => ({ ...d, opens: d.opens?.slice(0, 5) ?? null, closes: d.closes?.slice(0, 5) ?? null })),
      },
      role: ((m.data as { role: string } | null)?.role ?? "staff") as "owner" | "staff",
      userId: auth.user.id,
      reload: () => load(salon.id),
    });
    setState("ready");
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await browserClient().auth.signOut();
    router.replace("/login");
  }

  const nav = [
    { href: "/dashboard", label: "Kalender", icon: CalendarDays },
    { href: "/dashboard/kunden", label: "Kunden", icon: UsersRound },
    { href: "/dashboard/kassieren", label: "Kassieren", icon: QrCode },
    { href: "/dashboard/auswertung", label: "Auswertung", icon: ChartNoAxesColumn },
    { href: "/dashboard/leistungen", label: "Einstellungen", icon: SlidersHorizontal },
  ];

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-accent/25 bg-accent/10 text-accent">
              {ctx?.salon.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- small logo, already resized on upload
                <img src={ctx.salon.logo_url} alt="" className="size-full object-cover" />
              ) : (
                <LogoMark size={16} />
              )}
            </span>
            <div className="min-w-0">
              {salons.length > 1 && ctx ? (
                <select
                  aria-label="Betrieb wechseln"
                  className="max-w-[220px] truncate bg-transparent font-semibold tracking-tight outline-none"
                  value={ctx.salon.id}
                  onChange={(e) => { setState("loading"); load(e.target.value); }}
                >
                  {salons.map((s) => <option key={s.id} value={s.id} className="bg-card">{s.name}</option>)}
                </select>
              ) : (
                <div className="truncate font-semibold tracking-tight">{ctx?.salon.name ?? "Boxentakt"}</div>
              )}
              <div className="truncate text-xs text-muted">{user?.email}</div>
            </div>
          </div>
          <nav className="flex items-center gap-1 rounded-[14px] border border-line bg-card p-1">
            {state !== "nosalon" &&
              nav.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={path === href ? "page" : undefined}
                  className="hidden items-center gap-2 whitespace-nowrap rounded-[10px] px-3.5 py-2 text-sm font-medium text-muted hover:text-fg aria-[current=page]:bg-fg/7 aria-[current=page]:text-fg md:flex"
                >
                  <Icon size={16} /> {label}
                </Link>
              ))}
            {ctx && (
              <a href={`/${ctx.salon.slug}`} target="_blank" rel="noreferrer" aria-label="Buchungsseite öffnen" className="flex items-center gap-2 whitespace-nowrap rounded-[10px] px-3 py-2 text-sm font-medium text-muted hover:text-fg xl:px-3.5">
                <ExternalLink size={16} /> <span className="hidden xl:inline">Buchungsseite</span>
              </a>
            )}
            <ThemeToggle className="flex items-center rounded-[10px] px-3 py-2 text-muted hover:text-fg" />
            <button onClick={logout} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-muted hover:text-fg" aria-label="Abmelden">
              <LogOut size={16} />
            </button>
          </nav>
        </div>
      </header>
      {/* phones: app-style tab bar instead of the top navigation */}
      {state !== "nosalon" && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className="grid justify-items-center gap-1 py-2.5 text-[11px] font-medium text-muted aria-[current=page]:text-accent"
            >
              <Icon size={20} strokeWidth={1.75} /> {label}
            </Link>
          ))}
        </nav>
      )}
      <div className="mx-auto max-w-6xl px-4 pt-7 pb-28 sm:px-6 md:pb-7">
        {state === "loading" && <p className="text-muted">Lädt …</p>}
        {state === "nosalon" && user && <Onboarding email={user.email} meta={user.meta} onCreated={() => load()} />}
        {state === "ready" && ctx && <TrialBanner salonId={ctx.salon.id} />}
        {state === "ready" && ctx && <SalonContext.Provider value={ctx}>{children}</SalonContext.Provider>}
        {state === "ready" && ctx && (
          <footer className="mt-12 border-t border-line pt-6">
            <FeedbackButton salonId={ctx.salon.id} />
          </footer>
        )}
      </div>
    </div>
  );
}
