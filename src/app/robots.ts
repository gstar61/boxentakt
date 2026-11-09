import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // token pages are crawlable but answer with "noindex" (X-Robots-Tag in next.config.ts)
      disallow: ["/api/", "/dashboard"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
