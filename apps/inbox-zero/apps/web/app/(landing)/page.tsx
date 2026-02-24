import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { WordReveal } from "@/components/new-landing/common/WordReveal";
import { Awards } from "@/components/new-landing/sections/Awards";
import { BulkUnsubscribe } from "@/components/new-landing/sections/BulkUnsubscribe";
import { EverythingElseSection } from "@/components/new-landing/sections/EverythingElseSection";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { Testimonials } from "@/components/new-landing/sections/Testimonials";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function NewLanding() {
  if (process.env.INBOXZERO_BYPASS_AUTH === "true") {
    redirect("/welcome-redirect");
  }

  return (
    <BasicLayout>
      <Hero
        subtitle="Inbox Zero organizes your inbox and calendar, drafts replies in your voice, and helps you reach inbox zero fast. Never miss an important email again."
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Meet",
              "your",
              "AI",
              "email",
              "assistant",
              "that",
              <em key="actually">actually</em>,
              "works",
            ]}
          />
        }
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <OrganizedInbox
        subtitle="Drowning in emails? Don't waste energy trying to prioritize your emails. Our AI assistant will label everything automatically."
        title={
          <>
            Automatically organized.
            <br />
            Never miss an important email again.
          </>
        }
      />
      <PreWrittenDrafts
        subtitle="When you check your inbox, every email needing a response will have a pre-drafted reply in your tone, ready for you to send."
        title="Pre-written drafts waiting in your inbox"
      />
      <StartedInMinutes
        subtitle="One-click setup. Start organizing and drafting replies in minutes."
        title="Get started in minutes"
      />
      <BulkUnsubscribe />
      <EverythingElseSection />
      <Awards />
      <Pricing />
      <Testimonials />
      <FinalCTA />
      <FAQs />
    </BasicLayout>
  );
}
