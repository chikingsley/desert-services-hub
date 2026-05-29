import type { Metadata } from "next";
import { ContactForm } from "@/components/forms/contact-form";
import { Container } from "@/components/layout/container";
import { ContactInfo } from "@/components/sections/contact-info";
import { HeroSection } from "@/components/sections/hero-section";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { contactPage } from "@/data/pages";
import { siteConfig } from "@/data/site";

export const metadata: Metadata = {
  title: contactPage.metadata.metaTitle,
  description: contactPage.metadata.metaDescription,
  alternates: { canonical: "/contact/" },
};

export default function ContactPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "Contact", url: `${siteUrl}/contact/` },
        ]}
      />

      <HeroSection
        compact
        heading={contactPage.title}
        subheading={contactPage.sections[0]?.content}
      />

      {/* Two-column layout: form + contact info */}
      <section className="py-16 md:py-20">
        <Container>
          <div className="grid gap-12 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <h2 className="mb-6 font-bold font-heading text-2xl md:text-3xl">
                Send Us a Message
              </h2>
              <ContactForm />
            </div>
            <div className="lg:col-span-2">
              <h2 className="mb-6 font-bold font-heading text-2xl md:text-3xl">
                Contact Information
              </h2>
              <ContactInfo
                address={siteConfig.address}
                hours={`${siteConfig.hours.weekdays} | ${siteConfig.hours.friday}`}
                phone={siteConfig.phone}
              />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
