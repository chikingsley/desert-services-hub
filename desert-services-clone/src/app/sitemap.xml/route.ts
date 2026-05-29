import { NextResponse } from "next/server";

import { services } from "@/data/services";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

const TRAILING_SLASH = /\/$/;

const STATIC_PATHS = [
  "/",
  "/about/",
  "/careers/",
  "/contact/",
  "/privacy-policy/",
  "/servicerequests/",
  "/services/",
  "/services/site-services/",
  "/sitemap/",
];

export function GET() {
  const base = SITE_URL.replace(TRAILING_SLASH, "");

  const allPaths = [
    ...STATIC_PATHS,
    ...services.map((s) => `/services/${s.slug}/`),
  ];

  const urls = allPaths
    .map((p) => `  <url><loc>${base}${p}</loc></url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}
