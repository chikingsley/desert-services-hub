import type { Metadata } from "next";
import { CTASection } from "@/components/sections/cta-section";
import { HeroSection } from "@/components/sections/hero-section";
import { ServiceGrid } from "@/components/sections/service-grid";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { services } from "@/data/services";
import { siteConfig } from "@/data/site";

export const metadata: Metadata = {
  title: "Construction Support Services from Desert Services",
  description:
    "Our construction support services will keep your project running safely and efficiently. We provide a wide range of beneficial assistance.",
  alternates: { canonical: "/services/" },
};

export default function ServicesPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "Services", url: `${siteUrl}/services/` },
        ]}
      />

      <HeroSection
        heading="Construction Support Services"
        subheading="Comprehensive site services to keep your Arizona construction project running smoothly"
      />

      <ServiceGrid services={[...services]} />

      <CTASection
        cta={{ label: "Request Service", href: "/servicerequests/" }}
        description="Contact us today to discuss your construction site service needs."
        heading="Ready to Get Started?"
        phone={siteConfig.phone}
      />
    </>
  );
}
