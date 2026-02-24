import Image from "next/image";
import { Badge } from "@/components/new-landing/common/Badge";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Card } from "@/components/new-landing/common/Card";
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
import { AutoOrganize } from "@/components/new-landing/icons/AutoOrganize";
import { Bell } from "@/components/new-landing/icons/Bell";
import { Calendar } from "@/components/new-landing/icons/Calendar";
import { Connect } from "@/components/new-landing/icons/Connect";
import { Envelope } from "@/components/new-landing/icons/Envelope";
import { Fire } from "@/components/new-landing/icons/Fire";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Megaphone } from "@/components/new-landing/icons/Megaphone";
import { Newsletter } from "@/components/new-landing/icons/Newsletter";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import { SnowFlake } from "@/components/new-landing/icons/SnowFlake";
import { SparkleBlue } from "@/components/new-landing/icons/SparkleBlue";
import { Team } from "@/components/new-landing/icons/Team";

interface StartedInMinutesProps {
  subtitle: React.ReactNode;
  title: React.ReactNode;
}

export function StartedInMinutes({ title, subtitle }: StartedInMinutesProps) {
  return (
    <Section>
      <SectionHeading>{title}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
      <SectionContent className="sm:mx-10 md:mx-40 lg:mx-0">
        <CardWrapper className="grid w-full grid-cols-1 gap-5 lg:grid-cols-3">
          <BlurFade inView>
            <DisplayCard
              centerContent={true}
              className="h-full"
              description="Link your Gmail or Outlook in two clicks to get started."
              icon={
                <Badge icon={<Connect />} size="sm" variant="dark-gray">
                  STEP 1
                </Badge>
              }
              title="Connect your Google or Microsoft email"
            >
              <div className="flex gap-4">
                <CardWrapper padding="xs-2" rounded="full">
                  <Card variant="circle">
                    <div className="translate-y-1 p-2">
                      <Gmail height="64" width="64" />
                    </div>
                  </Card>
                </CardWrapper>
                <CardWrapper padding="xs-2" rounded="full">
                  <Card variant="circle">
                    <div className="translate-y-1 p-2">
                      <Outlook height="64" width="64" />
                    </div>
                  </Card>
                </CardWrapper>
              </div>
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25} inView>
            <DisplayCard
              centerContent
              className="h-full"
              description="Smart categories set up automatically. Use our categories or create your own."
              icon={
                <Badge icon={<AutoOrganize />} size="sm" variant="dark-gray">
                  STEP 2
                </Badge>
              }
              title="Organizes your inbox exactly how you want it"
            >
              <div className="flex scale-[110%] flex-col gap-2">
                <div className="flex gap-2">
                  <Badge icon={<Newsletter />} variant="purple">
                    Newsletter
                  </Badge>
                  <Badge icon={<Envelope />} variant="dark-blue">
                    To Reply
                  </Badge>
                  <Badge icon={<Megaphone />} variant="green">
                    Marketing
                  </Badge>
                  <Badge icon={<Calendar />} variant="yellow">
                    Calendar
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Badge icon={<Bell />} variant="red">
                    Notification
                  </Badge>
                  <Badge icon={<SnowFlake />} variant="light-blue">
                    Cold Email
                  </Badge>
                  <Badge icon={<Team />} variant="orange">
                    Team
                  </Badge>
                  <Badge icon={<Fire />} variant="pink">
                    Urgent
                  </Badge>
                </div>
              </div>
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25 * 2} inView>
            <DisplayCard
              description="Every email you get needing a reply will have a pre-written draft."
              icon={
                <Badge icon={<SparkleBlue />} size="sm" variant="dark-gray">
                  STEP 3
                </Badge>
              }
              title="Pre-drafted replies based on your email history and calendar"
            >
              <div className="pt-6 pl-6">
                <Image
                  alt="Pre-drafted replies"
                  height={400}
                  src="/images/new-landing/new-message.png"
                  width={1000}
                />
              </div>
            </DisplayCard>
          </BlurFade>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
