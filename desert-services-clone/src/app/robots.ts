import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

const TRAILING_SLASH = /\/$/;

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(TRAILING_SLASH, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
