import { NextResponse } from "next/server";

export const dynamic = "force-static";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

const TRAILING_SLASH = /\/$/;

export function GET() {
  const base = SITE_URL.replace(TRAILING_SLASH, "");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"
\txmlns:content="http://purl.org/rss/1.0/modules/content/"
\txmlns:dc="http://purl.org/dc/elements/1.1/"
\txmlns:atom="http://www.w3.org/2005/Atom"
\txmlns:sy="http://purl.org/rss/1.0/modules/syndication/"
\t>
\n<channel>
\t<title>Comments for Desert Services</title>
\t<atom:link href="${base}/comments/feed/" rel="self" type="application/rss+xml" />
\t<link>${base}/</link>
\t<description></description>
\t<language>en-US</language>
\t<generator>Next.js</generator>
</channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
    },
  });
}
