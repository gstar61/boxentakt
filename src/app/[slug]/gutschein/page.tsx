import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadSalon } from "@/lib/salon";
import { publicClient } from "@/lib/supabase";
import VoucherClient from "./VoucherClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/[slug]/gutschein">): Promise<Metadata> {
  const { slug } = await props.params;
  const salon = await loadSalon(slug);
  return salon ? { title: `Gutschein verschenken – ${salon.name}`, description: `Gutschein für ${salon.name} online kaufen, sofort per Mail zum Ausdrucken oder Weiterleiten.` } : { title: "Betrieb nicht gefunden" };
}

export default async function Page(props: PageProps<"/[slug]/gutschein">) {
  const { slug } = await props.params;
  const salon = await loadSalon(slug);
  if (!salon) notFound();
  const { data: open } = await publicClient().rpc("salon_vouchers_open", { p_slug: slug });
  return <VoucherClient salon={{ slug: salon.slug, name: salon.name, logo_url: salon.logo_url, address: salon.address, phone: salon.phone }} open={Boolean(open)} />;
}
