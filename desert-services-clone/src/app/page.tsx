import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { AccordionFAQ } from "@/components/sections/accordion-faq";
import { CTASection } from "@/components/sections/cta-section";
import { HeroSection } from "@/components/sections/hero-section";
import { ServiceCard } from "@/components/sections/service-card";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { LocalBusinessSchema } from "@/components/seo/local-business-schema";
import { homepage } from "@/data/pages";
import { services } from "@/data/services";
import { siteConfig } from "@/data/site";

export const metadata: Metadata = {
  title: "Desert Services - Construction Site Services for Maricopa County",
  description:
    "Desert Services delivers superior construction site services in Arizona with a focus on efficiency and reliability.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";
  return (
    <>
      <LocalBusinessSchema
        address={siteConfig.address}
        areaServed="Arizona"
        description={siteConfig.description}
        logo="/images/logos/horizontal-color-logo.png"
        name={siteConfig.name}
        phone={siteConfig.phone}
        url={siteUrl}
      />
      <BreadcrumbSchema items={[{ name: "Home", url: siteUrl }]} />

      <HeroSection
        backgroundImage="/images/services/desert-services-setting-up-construction-entry-way.jpg"
        cta={{ label: "Request Service", href: "/servicerequests/" }}
        heading="Reliable Construction Site Services in Arizona"
        subheading="A Professional Team for Construction Site Cleanup and Support"
      />

      {/* Intro section */}
      <section className="py-16 md:py-20">
        <Container className="max-w-3xl text-center">
          {homepage.sections.map((section) => (
            <div
              className="mb-6"
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

      {/* Service cards grid */}
      <section className="bg-muted py-16 md:py-20">
        <Container>
          <h2 className="mb-10 text-center font-bold font-heading text-2xl md:text-3xl">
            Our Services
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 9).map((service) => (
              <ServiceCard
                description={service.shortDescription}
                href={`/services/${service.slug}/`}
                image={service.heroImage}
                key={service.slug}
                title={service.title}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ section */}
      {homepage.faq && (
        <AccordionFAQ
          heading="Frequently Asked Questions"
          items={[...homepage.faq]}
        />
      )}

      <CTASection
        cta={{ label: "Request Service", href: "/servicerequests/" }}
        description="Contact us today to discuss your construction site service needs."
        heading="Ready to Get Started?"
        phone={siteConfig.phone}
      />
    </>
  );
}
