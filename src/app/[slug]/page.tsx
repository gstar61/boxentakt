import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadSalon } from "@/lib/salon";
import { publicClient } from "@/lib/supabase";
import BookingClient from "./BookingClient";
import { JsonLd } from "@/components/JsonLd";
import { salonSchema } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const salon = await loadSalon(slug);
  if (!salon) return { title: "Betrieb nicht gefunden" };
  const image = salon.cover_url ?? salon.logo_url;
  return {
    title: `Termin buchen – ${salon.name}`,
    description: `Online-Termin bei ${salon.name}${salon.address ? `, ${salon.address}` : ""}. Freie Zeiten sehen und direkt buchen, ohne Konto.`,
    alternates: { canonical: `/${salon.slug}` },
    openGraph: { title: `Termin buchen – ${salon.name}`, url: `/${salon.slug}`, ...(image ? { images: [image] } : {}) },
  };
}

export default async function Page(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const salon = await loadSalon(slug);
  if (!salon) notFound();
  const [q, open] = await Promise.all([props.searchParams, publicClient().rpc("salon_vouchers_open", { p_slug: slug })]);
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <>
      <JsonLd data={salonSchema(salon)} />
      <BookingClient
        salon={salon}
        aborted={q.abgebrochen === "1"}
        initialDay={/^\d{4}-\d{2}-\d{2}$/.test(one(q.tag) ?? "") ? one(q.tag) : undefined}
        initialService={one(q.leistung)}
        vouchers={Boolean(open.data)}
      />
    </>
  );
}
