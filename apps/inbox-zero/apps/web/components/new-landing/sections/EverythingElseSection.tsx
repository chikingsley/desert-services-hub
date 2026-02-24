import Image from "next/image";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import { DisplayCard } from "@/components/new-landing/common/DisplayCard";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import { Analytics } from "@/components/new-landing/icons/Analytics";
import { ChatTwo } from "@/components/new-landing/icons/ChatTwo";
import { Link } from "@/components/new-landing/icons/Link";

export function EverythingElseSection() {
  return (
    <Section>
      <SectionHeading>Designed around how you actually work</SectionHeading>
      <SectionSubtitle>
        Flexible enough to fit any workflow. Simple enough to set up in minutes.
      </SectionSubtitle>
      <SectionContent
        className="mt-5 flex flex-col items-center gap-5 sm:mx-10 md:mx-40 lg:mx-0"
        noMarginTop
      >
        <CardWrapper className="grid w-full grid-cols-1 gap-5 lg:grid-cols-3">
          <BlurFade inView>
            <DisplayCard
              description="See who emails you most and what's clogging your inbox. Get clear insights, then take action."
              icon={<Analytics />}
              title="Email analytics. What gets measured, gets managed"
            >
              <Image
                alt="metrics"
                height={400}
                src="/images/new-landing/metrics.svg"
                width={1000}
              />
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25} inView>
            <DisplayCard
              description="Connects to your calendar and CRM to draft emails based on your actual schedule and customer data."
              icon={<Link />}
              title="Drafts that know your schedule and availability"
            >
              <Image
                alt="App integrations"
                height={400}
                src="/images/new-landing/integrations.png"
                width={1000}
              />
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25 * 2} inView>
            <DisplayCard
              description="Your inbox, your rules. Configure everything in plain English. Make it work the way you actually work."
              icon={<ChatTwo />}
              title="Built to fit your workflow. Customize in plain English"
            >
              <Image
                alt="Customize"
                height={400}
                src="/images/new-landing/create-rules.png"
                width={1000}
              />
            </DisplayCard>
          </BlurFade>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
