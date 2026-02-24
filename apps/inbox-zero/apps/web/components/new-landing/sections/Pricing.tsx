"use client";

import { Label, Radio, RadioGroup } from "@headlessui/react";
import Link from "next/link";
import type { PostHog } from "posthog-js";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { type Tier, tiers } from "@/app/(app)/premium/config";
import {
  Badge,
  type BadgeVariant,
} from "@/components/new-landing/common/Badge";
import {
  Button,
  type ButtonVariant,
} from "@/components/new-landing/common/Button";
import { Card, CardContent } from "@/components/new-landing/common/Card";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  Paragraph,
  SectionHeading,
  SectionSubtitle,
  Subheading,
} from "@/components/new-landing/common/Typography";
import { Briefcase } from "@/components/new-landing/icons/Briefcase";
import { Chat } from "@/components/new-landing/icons/Chat";
import { Check } from "@/components/new-landing/icons/Check";
import { Sparkle } from "@/components/new-landing/icons/Sparkle";
import { Zap } from "@/components/new-landing/icons/Zap";
import { landingPageAnalytics } from "@/hooks/useAnalytics";
import { cn } from "@/utils";

type PricingTier = Tier & {
  badges?: {
    message: string;
    variant?: BadgeVariant;
    annualOnly?: boolean;
  }[];
  button: {
    content: string;
    variant?: ButtonVariant;
    icon?: React.ReactNode;
    href: string;
    target?: string;
  };
  icon: React.ReactNode;
};

const pricingTiers: PricingTier[] = [
  {
    ...tiers[0],
    badges: [{ message: "Save 10%", annualOnly: true }],
    button: {
      variant: "secondary-two",
      content: "Try free for 7 days",
      href: "/login",
    },
    icon: <Briefcase />,
  },
  {
    ...tiers[1],
    badges: [
      { message: "Save 20%", annualOnly: true },
      { message: "Popular", variant: "green" },
    ],
    button: {
      content: "Try free for 7 days",
      href: "/login",
    },
    icon: <Zap />,
  },
  {
    ...tiers[2],
    badges: [{ message: "Save 16%", annualOnly: true }],
    button: {
      variant: "secondary-two",
      content: "Try free for 7 days",
      href: "/login",
    },
    icon: <Sparkle />,
  },
];

const frequencies = ["annually", "monthly"];

export function Pricing() {
  const [frequency, setFrequency] = useState(frequencies[0]);
  const posthog = usePostHog();

  return (
    <Section id="pricing">
      <SectionHeading>Try for free, affordable paid plans</SectionHeading>
      <SectionSubtitle>No hidden fees. Cancel anytime.</SectionSubtitle>
      <SectionContent
        className="mt-6 flex flex-col items-center justify-center"
        noMarginTop
      >
        <RadioGroup
          className="mb-6 w-fit rounded-full p-1.5 font-semibold text-xs leading-5 shadow-[0_0_7px_0_rgba(0,0,0,0.0.07)] ring-1 ring-gray-200 ring-inset"
          onChange={setFrequency}
          value={frequency}
        >
          <Label className="sr-only">Payment frequency</Label>
          {frequencies.map((value) => (
            <Radio
              className={({ checked }) =>
                cn(
                  checked ? "bg-black text-white" : "text-gray-500",
                  "cursor-pointer rounded-full px-6 py-1"
                )
              }
              key={value}
              value={value}
            >
              <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
            </Radio>
          ))}
        </RadioGroup>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {pricingTiers.map((tier, index) => (
            <CardWrapper key={tier.name}>
              <PricingCard
                isAnnual={frequency === "annually"}
                posthog={posthog}
                tier={tier}
                tierIndex={index}
              />
            </CardWrapper>
          ))}
        </div>
        <CardWrapper className="mt-6 w-full">
          <Card variant="extra-rounding">
            <CardContent className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-4">
                <div className="text-gray-400">
                  <Sparkle />
                </div>
                <div>
                  <h3 className="font-title text-lg">Enterprise</h3>
                  <Paragraph className="mt-1" size="sm">
                    Need SSO, on-premise deployment, or a dedicated account
                    manager?
                  </Paragraph>
                </div>
              </div>
              <Button asChild size="lg" variant="secondary-two">
                <Link
                  href="https://go.getinboxzero.com/sales"
                  onClick={() =>
                    landingPageAnalytics.pricingCtaClicked(
                      posthog,
                      "Enterprise",
                      "Speak to sales"
                    )
                  }
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Chat />
                  <span className="relative z-10">Speak to sales</span>
                </Link>
              </Button>
            </CardContent>
          </Card>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}

interface PricingCardProps {
  isAnnual: boolean;
  posthog: PostHog;
  tier: PricingTier;
  tierIndex: number;
}

function PricingCard({ tier, tierIndex, isAnnual, posthog }: PricingCardProps) {
  const { name, description, features } = tier;
  const price = isAnnual ? tier.price.annually : tier.price.monthly;
  const isFirstTier = !tierIndex;

  return (
    <Card
      addon={
        <div className="flex h-0 items-center gap-1.5">
          {tier.badges
            ?.filter(({ annualOnly }) => !annualOnly || isAnnual)
            .map((badge) => (
              <Badge key={badge.message} variant={badge.variant}>
                {badge.message}
              </Badge>
            ))}
        </div>
      }
      className="h-full"
      description={description}
      icon={tier.icon}
      title={name}
      variant="extra-rounding"
    >
      <div className="px-6 pt-0 pb-6">
        <div className="space-y-6">
          <div className="flex items-end gap-2">
            {price ? (
              <>
                <Subheading>${price}</Subheading>
                <Paragraph className="-translate-y-1" color="light" size="xs">
                  /user /month
                </Paragraph>
              </>
            ) : (
              <Subheading>Contact us</Subheading>
            )}
          </div>
          <Button asChild auto size="lg" variant={tier.button.variant}>
            <Link
              href={tier.button.href}
              onClick={() =>
                landingPageAnalytics.pricingCtaClicked(
                  posthog,
                  tier.name,
                  tier.button.content
                )
              }
              target={tier.button.target}
            >
              {tier.button.icon}
              {/* z-10 keeps text above gradient background on hover to prevent color shift */}
              <span className="relative z-10">{tier.button.content}</span>
            </Link>
          </Button>
        </div>
      </div>
      <CardContent className="border-[#E7E7E780] border-t">
        {isFirstTier ? null : (
          <Paragraph className="mb-4 font-medium" size="sm">
            {tier.features[0].text}
          </Paragraph>
        )}
        <ul className="space-y-3">
          {features
            .filter((_, index) => !!isFirstTier || index > 0)
            .map((feature) => (
              <li
                className="flex items-center gap-2 text-gray-500 text-sm"
                key={feature.text}
              >
                <div className="text-blue-500">
                  <Check />
                </div>
                {feature.text}
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}
