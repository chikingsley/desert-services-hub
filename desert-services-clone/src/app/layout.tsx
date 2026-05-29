import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { navigation } from "@/data/navigation";
import { siteConfig } from "@/data/site";
import { antonio, lato, ptSerif, roboto } from "@/lib/fonts";

import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Desert Services",
  description:
    "Desert Services delivers superior construction site services in Arizona with a focus on efficiency and reliability.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    siteName: "Desert Services",
    images: [
      {
        url: "/images/logos/Desert-Services-SM.jpg",
        width: 1280,
        height: 720,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/images/logos/Desert-Services-SM.jpg"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${antonio.variable} ${lato.variable} ${roboto.variable} ${ptSerif.variable}`}
      lang="en-US"
    >
      <body>
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4"
          href="#content"
        >
          Skip to content
        </a>

        <SiteHeader navigation={[...navigation]} phone={siteConfig.phone} />

        <main id="content">{children}</main>

        <SiteFooter
          address={siteConfig.address}
          copyright={siteConfig.copyright.text}
          description={siteConfig.footer.description}
          fax={siteConfig.fax}
          hours={siteConfig.hours}
          links={[...siteConfig.footer.menuLinks]}
          mailingAddress={siteConfig.mailingAddress}
          phone={siteConfig.phone}
        />
      </body>
    </html>
  );
}
