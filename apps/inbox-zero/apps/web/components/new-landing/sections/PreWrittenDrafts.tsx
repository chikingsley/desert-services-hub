import Image from "next/image";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

interface PreWrittenDraftsProps {
  subtitle: React.ReactNode;
  title: React.ReactNode;
}

export function PreWrittenDrafts({ title, subtitle }: PreWrittenDraftsProps) {
  return (
    <Section>
      <SectionHeading>{title}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
      <SectionContent className="flex justify-center">
        <Image
          alt="pre-written drafts"
          className="hidden md:block"
          height={2000}
          src="/images/new-landing/pre-written-drafts.png"
          width={2000}
        />
        <Image
          alt="an organized inbox"
          className="block md:hidden"
          height={2000}
          src="/images/new-landing/pre-written-drafts-mobile.png"
          width={2000}
        />
      </SectionContent>
    </Section>
  );
}
