import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { Button } from "@/components/ui/button";
import { thankYouPage } from "@/data/pages";

export const metadata: Metadata = {
  title: thankYouPage.metadata.metaTitle,
  description: thankYouPage.metadata.metaDescription,
  alternates: { canonical: "/servicerequests/thank-you/" },
};

export default function ThankYouPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "Service Request", url: `${siteUrl}/servicerequests/` },
          { name: "Thank You", url: `${siteUrl}/servicerequests/thank-you/` },
        ]}
      />

      <section className="py-24 md:py-32">
        <Container className="max-w-2xl text-center">
          <h1 className="font-bold font-heading text-3xl md:text-4xl">
            {thankYouPage.title}
          </h1>
          {thankYouPage.sections.map((section) => (
            <p
              className="mt-4 text-lg text-muted-foreground leading-relaxed"
              key={section.content.slice(0, 40)}
            >
              {section.content}
            </p>
          ))}
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/">Return Home</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
