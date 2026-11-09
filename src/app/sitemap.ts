import type { MetadataRoute } from "next";
import { publicClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

/** Landing page, legal pages and the booking pages of every bookable salon. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await publicClient().rpc("public_salon_slugs");
  const slugs = (data as string[] | null) ?? [];
  return [
    { url: SITE.url, changeFrequency: "weekly", priority: 1 },
    ...["impressum", "datenschutz", "agb"].map((p) => ({ url: `${SITE.url}/${p}`, changeFrequency: "yearly" as const, priority: 0.2 })),
    ...slugs.flatMap((s) => [
      { url: `${SITE.url}/${s}`, changeFrequency: "daily" as const, priority: 0.8 },
      { url: `${SITE.url}/${s}/impressum`, changeFrequency: "yearly" as const, priority: 0.1 },
    ]),
  ];
}
