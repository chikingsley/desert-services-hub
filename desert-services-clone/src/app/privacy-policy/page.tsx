import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { HeroSection } from "@/components/sections/hero-section";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { privacyPolicyPage } from "@/data/pages";

export const metadata: Metadata = {
  title: privacyPolicyPage.metadata.metaTitle,
  description: privacyPolicyPage.metadata.metaDescription,
  alternates: { canonical: "/privacy-policy/" },
};

export default function PrivacyPolicyPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "Privacy Policy", url: `${siteUrl}/privacy-policy/` },
        ]}
      />

      <HeroSection compact heading={privacyPolicyPage.title} />

      <section className="py-16 md:py-20">
        <Container className="prose prose-gray mx-auto max-w-3xl">
          {privacyPolicyPage.sections.map((section) => (
            <div
              className="mb-8"
              key={section.heading ?? section.content.slice(0, 40)}
            >
              {section.heading && (
                <h2 className="font-bold font-heading text-xl md:text-2xl">
                  {section.heading}
                </h2>
              )}
              <p className="mt-3 text-muted-foreground leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}
        </Container>
      </section>
    </>
  );
}
