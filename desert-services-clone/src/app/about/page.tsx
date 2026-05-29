import type { Metadata } from "next";
import Image from "next/image";
import { Container } from "@/components/layout/container";
import { CTASection } from "@/components/sections/cta-section";
import { HeroSection } from "@/components/sections/hero-section";
import { TeamMemberCard } from "@/components/sections/team-member-card";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { aboutPage, aboutServiceAreas } from "@/data/pages";
import { siteConfig } from "@/data/site";
import { ceo, team } from "@/data/team";

export const metadata: Metadata = {
  title: aboutPage.metadata.metaTitle,
  description: aboutPage.metadata.metaDescription,
  alternates: { canonical: "/about/" },
};

export default function AboutPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertservices.net";

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: siteUrl },
          { name: "About", url: `${siteUrl}/about/` },
        ]}
      />

      <HeroSection
        backgroundImage={`/images/team/${aboutPage.heroImage}`}
        heading={aboutPage.title}
        subheading={aboutPage.subtitle}
      />

      {/* Company intro sections */}
      <section className="py-16 md:py-20">
        <Container className="max-w-3xl">
          {aboutPage.sections.map((section) => (
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

      {/* CEO Spotlight */}
      <section className="bg-muted py-16 md:py-20">
        <Container className="max-w-5xl">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-lg">
              <Image
                alt={ceo.name}
                className="object-cover"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                src={`/images/team/${ceo.image}`}
              />
            </div>
            <div>
              <h2 className="mb-4 font-bold font-heading text-2xl md:text-3xl">
                Meet Our CEO
              </h2>
              <p className="mb-6 text-muted-foreground leading-relaxed">
                We have an unwavering philosophy of caring for our customers. We
                respect our customers with honesty and hard work to ensure we
                help ease their daily tasks. We believe and understand all
                projects are important no matter how big or small.
              </p>
              <p className="font-bold font-heading text-lg">{ceo.name}</p>
              <p className="text-muted-foreground">{ceo.title}</p>
              {ceo.linkedIn && (
                <a
                  className="mt-2 inline-block text-primary text-sm hover:underline"
                  href={ceo.linkedIn}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View LinkedIn Profile
                </a>
              )}
            </div>
          </div>
        </Container>
      </section>

      {/* Team Grid */}
      <section className="py-16 md:py-20">
        <Container>
          <h2 className="mb-10 text-center font-bold font-heading text-2xl md:text-3xl">
            Our Team
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {team.map((member) => (
              <TeamMemberCard
                image={`/images/team/${member.image}`}
                key={member.name}
                name={member.name}
                title={member.title}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* Company History */}
      <section className="bg-muted py-16 md:py-20">
        <Container className="max-w-3xl text-center">
          <h2 className="mb-6 font-bold font-heading text-2xl md:text-3xl">
            Our History
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Desert Services began over 25 years ago as Desert Spray, a water
            truck company providing dust control services to contractors across
            the greater Phoenix area. With just two trucks and a focus on
            dependable service, the business quickly earned a reputation for
            reliability and grew steadily from its early days. In 2003, Michael
            Lanning acquired the company and expanded it beyond water trucks --
            adding SWPPP, temporary fencing, portable restrooms, roll-off
            containers, street sweeping, and site cleaning services. Under
            Mike&apos;s leadership, Desert Services became a trusted,
            full-service partner for construction site needs across Arizona.
          </p>
        </Container>
      </section>

      {/* Service Areas Checklist */}
      <section className="py-16 md:py-20">
        <Container className="max-w-3xl">
          <h2 className="mb-8 text-center font-bold font-heading text-2xl md:text-3xl">
            Our Service Areas
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {aboutServiceAreas.map((area) => (
              <li
                className="flex items-center gap-2 text-muted-foreground"
                key={area}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                />
                {area}
              </li>
            ))}
          </ul>
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
