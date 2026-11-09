import type { Metadata } from "next";

export const metadata: Metadata = { title: "Neues Passwort", robots: { index: false, follow: false } };

export default function Layout({ children }: LayoutProps<"/passwort">) {
  return children;
}
