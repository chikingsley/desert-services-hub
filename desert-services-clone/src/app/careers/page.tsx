import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { HeroSection } from "@/components/sections/hero-section";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { Button } from "@/components/ui/button";
import { careerPositions, careersPage } from "@/data/pages";

export const metadata: Metadata = {
  title: careersPage.metadata.metaTitle,
  description: careersPage.metadata.metaDescription,
  alternates: { canonical: "/careers/" },
};

export default function CareersPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "About", url: `${siteUrl}/about/` },
          { name: "Careers", url: `${siteUrl}/careers/` },
        ]}
      />

      <HeroSection
        heading={careersPage.title}
        subheading={careersPage.subtitle}
      />

      {/* Content sections */}
      <section className="py-16 md:py-20">
        <Container className="max-w-3xl">
          {careersPage.sections.map((section) => (
            <div
              className="mb-8"
              key={section.heading ?? section.content.slice(0, 40)}
            >
              {section.heading && (
                <h2 className="mb-4 font-bold font-heading text-2xl md:text-3xl">
                  {section.heading}
                </h2>
              )}
              <p className="text-muted-foreground leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}
        </Container>
      </section>

      {/* CDL Positions */}
      <section className="bg-muted py-16 md:py-20">
        <Container className="max-w-3xl">
          <h2 className="mb-6 font-bold font-heading text-2xl md:text-3xl">
            {careerPositions.cdl.heading}
          </h2>
          <ul className="mb-8 space-y-3">
            {careerPositions.cdl.positions.map((position) => (
              <li
                className="flex items-center gap-2 text-muted-foreground"
                key={position}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                />
                {position}
              </li>
            ))}
          </ul>
          <Button asChild size="lg">
            <a
              href={careerPositions.cdl.applyUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Apply for CDL Positions
            </a>
          </Button>
        </Container>
      </section>

      {/* Non-CDL Positions */}
      <section className="py-16 md:py-20">
        <Container className="max-w-3xl">
          <h2 className="mb-6 font-bold font-heading text-2xl md:text-3xl">
            {careerPositions.nonCdl.heading}
          </h2>
          <ul className="mb-8 space-y-3">
            {careerPositions.nonCdl.positions.map((position) => (
              <li
                className="flex items-center gap-2 text-muted-foreground"
                key={position}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                />
                {position}
              </li>
            ))}
          </ul>
          <Button asChild size="lg">
            <Link href="/contact/">Contact Us to Apply</Link>
          </Button>
        </Container>
      </section>
    </>
  );
}
