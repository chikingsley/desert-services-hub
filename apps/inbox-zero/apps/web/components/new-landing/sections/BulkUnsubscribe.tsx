import Image from "next/image";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

export function BulkUnsubscribe() {
  return (
    <Section>
      <SectionHeading>
        Get to Inbox Zero fast.
        <br />
        Bulk unsubscribe from emails you never read.
      </SectionHeading>
      <SectionSubtitle>
        See which emails you never read, and one-click unsubscribe and archive
        them.
      </SectionSubtitle>
      <SectionContent className="flex items-center justify-center">
        <CardWrapper
          className="hidden md:mx-20 md:block lg:mx-40 xl:mx-52"
          padding="xs"
          rounded="md"
        >
          <Image
            alt="bulk unsubscribe"
            height={1000}
            src="/images/new-landing/bulk-unsubscribe.png"
            width={1000}
          />
        </CardWrapper>
        <div className="flex flex-col gap-2">
          <CardWrapper className="block md:hidden" padding="xs" rounded="md">
            <Image
              alt="bulk unsubscribe"
              height={1000}
              src="/images/new-landing/bulk-unsubscribe-mobile.png"
              width={1000}
            />
          </CardWrapper>
        </div>
      </SectionContent>
    </Section>
  );
}
