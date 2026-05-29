import type { Metadata } from "next";
import { ServiceRequestForm } from "@/components/forms/service-request-form";
import { Container } from "@/components/layout/container";
import { HeroSection } from "@/components/sections/hero-section";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { serviceRequestPage } from "@/data/pages";

export const metadata: Metadata = {
  title: serviceRequestPage.metadata.metaTitle,
  description: serviceRequestPage.metadata.metaDescription,
  alternates: { canonical: "/servicerequests/" },
};

export default function ServiceRequestPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "Service Request", url: `${siteUrl}/servicerequests/` },
        ]}
      />

      <HeroSection
        compact
        heading={serviceRequestPage.title}
        subheading={serviceRequestPage.sections[0]?.content}
      />

      <section className="py-16 md:py-20">
        <Container className="max-w-3xl">
          <ServiceRequestForm />
        </Container>
      </section>
    </>
  );
}
