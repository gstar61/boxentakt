"use client";

import { useSyncExternalStore } from "react";
import { MonitorCog, Moon, Sun } from "lucide-react";
import { THEME_KEY } from "@/lib/theme";

type Theme = "light" | "dark" | "system";

const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "System", light: "Hell", dark: "Dunkel" };
const ICON = { system: MonitorCog, light: Sun, dark: Moon };

const read = (): Theme => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
};

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("salonbuch-theme", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("salonbuch-theme", cb);
  };
};

/** Cycles System → Hell → Dunkel; the icon shows the current mode. */
export function ThemeToggle({ className = "icon-btn" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const Icon = ICON[theme];

  const next = () => {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    try {
      if (t === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch {}
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    window.dispatchEvent(new Event("salonbuch-theme"));
  };

  return (
    <button type="button" onClick={next} className={className} title={`Darstellung: ${LABEL[theme]}`} aria-label={`Darstellung wechseln (aktuell: ${LABEL[theme]})`}>
      <Icon size={16} />
    </button>
  );
}
