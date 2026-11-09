import type { Metadata } from "next";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false, follow: true } };

export default function Layout({ children }: LayoutProps<"/login">) {
  return children;
}
