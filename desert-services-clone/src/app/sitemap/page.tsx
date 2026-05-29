import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { sitemapLinks, sitemapPage } from "@/data/pages";

export const metadata: Metadata = {
  title: sitemapPage.metadata.metaTitle,
  description: sitemapPage.metadata.metaDescription,
  alternates: { canonical: "/sitemap/" },
};

export default function SitemapPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "Sitemap", url: `${siteUrl}/sitemap/` },
        ]}
      />

      <section className="py-16 md:py-20">
        <Container className="max-w-3xl">
          <h1 className="mb-10 font-bold font-heading text-3xl md:text-4xl">
            {sitemapPage.title}
          </h1>
          <ul className="space-y-3">
            {sitemapLinks.map((link) => (
              <li key={link.href}>
                <Link className="text-primary hover:underline" href={link.href}>
                  {link.label}
                </Link>
                {"children" in link && link.children && (
                  <ul className="mt-2 ml-6 space-y-2">
                    {link.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          className="text-primary hover:underline"
                          href={child.href}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
