import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { CTASection } from "@/components/sections/cta-section";
import { HeroSection } from "@/components/sections/hero-section";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { ServiceSchema } from "@/components/seo/service-schema";
import { servicesHub } from "@/data/services";
import { siteConfig } from "@/data/site";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

export const metadata: Metadata = {
  title: servicesHub.metadata.metaTitle,
  description: servicesHub.metadata.metaDescription,
  alternates: { canonical: `/services/${servicesHub.slug}/` },
};

export default function SiteServicesPage() {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "Services", url: `${siteUrl}/services/` },
          { name: servicesHub.title },
        ]}
      />
      <ServiceSchema
        areaServed="Arizona"
        description={servicesHub.shortDescription}
        name={servicesHub.title}
        providerName={siteConfig.name}
        providerUrl={siteUrl}
        url={`${siteUrl}/services/${servicesHub.slug}/`}
      />

      <HeroSection compact heading={servicesHub.title} />

      <section className="py-16 md:py-20">
        <Container className="max-w-4xl">
          {servicesHub.sections.map((section) => (
            <div className="mb-10" key={section.heading}>
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

      <CTASection
        cta={{ label: "Request Service", href: "/servicerequests/" }}
        description="Contact us today to discuss your construction site service needs."
        heading="Ready to Get Started?"
        phone={siteConfig.phone}
      />
    </>
  );
}
