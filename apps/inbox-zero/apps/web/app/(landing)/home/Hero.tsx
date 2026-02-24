"use client";

import Image from "next/image";
import { usePostHog } from "posthog-js/react";
import { CallToAction } from "@/components/new-landing/CallToAction";
import {
  Badge,
  type BadgeVariant,
} from "@/components/new-landing/common/Badge";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  PageHeading,
  Paragraph,
} from "@/components/new-landing/common/Typography";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import { Play } from "@/components/new-landing/icons/Play";
import { LiquidGlassButton } from "@/components/new-landing/LiquidGlassButton";
import { UnicornScene } from "@/components/new-landing/UnicornScene";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

interface HeroProps {
  badge?: React.ReactNode;
  badgeVariant?: BadgeVariant;
  children?: React.ReactNode;
  subtitle?: React.ReactNode;
  title?: React.ReactNode;
}

export function Hero({
  title,
  subtitle,
  badge,
  badgeVariant = "blue",
  children,
}: HeroProps) {
  return (
    <Section className={badge ? "mt-7 md:mt-7" : "mt-10 md:mt-20"}>
      {badge ? (
        <BlurFade delay={0} duration={0.4}>
          <div className="mb-7 flex justify-center">
            <Badge variant={badgeVariant}>{badge}</Badge>
          </div>
        </BlurFade>
      ) : null}
      <PageHeading>{title}</PageHeading>
      <BlurFade delay={0.125 * 5} duration={0.4}>
        <Paragraph className={"mx-auto mt-6 max-w-[640px]"} size="lg">
          {subtitle}
        </Paragraph>
      </BlurFade>
      <SectionContent className="mt-6 md:mt-8" noMarginTop>
        <div className="mb-8 space-y-3">
          <BlurFade delay={0.125 * 7} duration={0.4}>
            <CallToAction />
          </BlurFade>
          <BlurFade delay={0.125 * 8} duration={0.4}>
            <div className="mb-12 flex items-center justify-center gap-2">
              <Paragraph color="light" size="sm">
                Works with
              </Paragraph>
              <Outlook />
              <Gmail />
            </div>
          </BlurFade>
        </div>
        {children}
      </SectionContent>
    </Section>
  );
}

export function HeroVideoPlayer() {
  const posthog = usePostHog();

  return (
    <BlurFade delay={0.125 * 9}>
      <div className="relative w-full">
        <div className="relative block overflow-hidden rounded-3xl border border-[#EFEFEF] md:rounded-[43px]">
          <Dialog>
            <DialogTrigger
              asChild
              onClick={() => landingPageAnalytics.videoClicked(posthog)}
            >
              <LiquidGlassButton className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div>
                  <Play className="translate-x-[2px]" />
                </div>
              </LiquidGlassButton>
            </DialogTrigger>
            <DialogContent className="max-w-7xl border-0 bg-transparent p-0">
              <DialogTitle className="sr-only">Video player</DialogTitle>
              <div className="relative aspect-video w-full">
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="size-full rounded-lg"
                  src="https://www.youtube.com/embed/hfvKvTHBjG0?autoplay=1&rel=0"
                  title="Video content"
                />
              </div>
            </DialogContent>
          </Dialog>
          <Image
            alt="an organized inbox"
            className="w-full"
            height={1000}
            src="/images/new-landing/video-thumbnail.png"
            width={2000}
          />
          <UnicornScene className="h-[calc(100%+5px)] opacity-30" />
        </div>
      </div>
    </BlurFade>
  );
}
