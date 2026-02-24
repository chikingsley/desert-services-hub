import Image from "next/image";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

interface OrganizedInboxProps {
  subtitle: React.ReactNode;
  title: React.ReactNode;
}

export function OrganizedInbox({ title, subtitle }: OrganizedInboxProps) {
  return (
    <Section>
      <SectionHeading>{title}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
      <SectionContent className="flex justify-center">
        <Image
          alt="an organized inbox"
          className="hidden md:block"
          height={1000}
          src="/images/new-landing/an-organized-inbox.png"
          width={1000}
        />
        <Image
          alt="an organized inbox"
          className="block md:hidden"
          height={1000}
          src="/images/new-landing/an-organized-inbox-mobile.png"
          width={1000}
        />
      </SectionContent>
    </Section>
  );
}
