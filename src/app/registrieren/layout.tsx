import type { Metadata } from "next";

export const metadata: Metadata = { title: "Salon registrieren", description: "Salon in zwei Minuten anlegen, 30 Tage kostenlos testen.", robots: { index: true, follow: true } };

export default function Layout({ children }: LayoutProps<"/registrieren">) {
  return children;
}
