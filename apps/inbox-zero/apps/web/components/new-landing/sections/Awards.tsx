import Image from "next/image";
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
} from "@/components/new-landing/common/Typography";
import { cn } from "@/utils";

type Award = {
  title: string;
  description: string;
  image: string;
  imageSize?: number;
  top?: string;
  hideOnMobile?: boolean;
};

const awards: Award[] = [
  {
    title: "SOC2 Compliant",
    description: "Enterprise-grade security. SOC 2 Type 2 certified",
    image: "/images/new-landing/awards/soc-award.png",
  },
  {
    title: "#1 GitHub Trending",
    description: "Trusted and loved by developers worldwide",
    image: "/images/new-landing/awards/github-trending-award.png",
    imageSize: 160,
    top: "top-2",
    hideOnMobile: true,
  },
  {
    title: "#1 Product Hunt",
    description: "Product of the Day on Product Hunt",
    image: "/images/new-landing/awards/product-hunt-award.png",
    imageSize: 170,
  },
  {
    title: "9k GitHub Stars",
    description: "Open-source. See exactly what the code does",
    image: "/images/new-landing/awards/github-stars-award.png",
    imageSize: 170,
    top: "top-3",
  },
];

const defaultAwardImageSize = 200;

export function Awards() {
  return (
    <Section>
      <SectionHeading>Privacy first and open source</SectionHeading>
      <SectionSubtitle>
        Your data stays private — no AI training, no funny business. We’re fully
        certified for top-tier security, and you can even self-host Inbox Zero
        if you want total control.
      </SectionSubtitle>
      <SectionContent
        className="mt-20 grid grid-cols-1 gap-x-5 gap-y-20 md:grid-cols-2 lg:grid-cols-4 lg:gap-y-0"
        noMarginTop
      >
        {awards.map((award) => (
          <CardWrapper
            className={cn(award.hideOnMobile && "hidden md:block")}
            key={award.title}
            padding="sm"
            rounded="sm"
          >
            <Card
              className="relative h-full gap-3 pt-24 text-center"
              variant="extra-rounding"
            >
              <CardContent>
                <Image
                  alt={award.title}
                  className={cn(
                    "absolute left-1/2 -translate-x-1/2 -translate-y-20",
                    award.top || "top-0"
                  )}
                  height={award.imageSize || defaultAwardImageSize}
                  src={award.image}
                  width={award.imageSize || defaultAwardImageSize}
                />
                <Paragraph className="font-bold" color="gray-900" size="md">
                  {award.title}
                </Paragraph>
                <Paragraph className="mt-4" size="sm">
                  {award.description}
                </Paragraph>
              </CardContent>
            </Card>
          </CardWrapper>
        ))}
      </SectionContent>
    </Section>
  );
}
