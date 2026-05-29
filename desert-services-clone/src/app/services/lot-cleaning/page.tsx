import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { AccordionFAQ } from "@/components/sections/accordion-faq";
import { CTASection } from "@/components/sections/cta-section";
import { HeroSection } from "@/components/sections/hero-section";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { ServiceSchema } from "@/components/seo/service-schema";
import { getService } from "@/data/services";
import { siteConfig } from "@/data/site";

const service = getService("lot-cleaning");
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

export const metadata: Metadata = {
  title: service.metadata.metaTitle,
  description: service.metadata.metaDescription,
  alternates: { canonical: `/services/${service.slug}/` },
};

export default function LotCleaningPage() {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "Services", url: `${siteUrl}/services/` },
          { name: service.title },
        ]}
      />
      <ServiceSchema
        areaServed="Arizona"
        description={service.shortDescription}
        name={service.title}
        providerName={siteConfig.name}
        providerUrl={siteUrl}
        url={`${siteUrl}/services/${service.slug}/`}
      />

      <HeroSection
        backgroundImage={service.heroImage || undefined}
        compact
        heading={service.title}
      />

      <section className="py-16 md:py-20">
        <Container className="max-w-4xl">
          {service.sections.map((section) => (
            <div
              className="mb-10"
              key={section.heading ?? section.content.slice(0, 50)}
            >
              {section.heading && (
                <h2 className="mb-4 font-bold font-heading text-2xl">
                  {section.heading}
                </h2>
              )}
              <div className="prose prose-lg max-w-none text-muted-foreground">
                <p>{section.content}</p>
              </div>
            </div>
          ))}
        </Container>
      </section>

      {service.faq.length > 0 && (
        <AccordionFAQ
          heading="Frequently Asked Questions"
          items={[...service.faq]}
        />
      )}

      <CTASection
        cta={{ label: "Request Service", href: "/servicerequests/" }}
        description="Contact us today to discuss your cleaning needs."
        heading="Need Parking Lot Cleaning?"
        phone={siteConfig.phone}
      />
    </>
  );
}
