import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { FC } from "react";

export type ColdEmailNotificationProps = {
  baseUrl: string;
};

type ColdEmailNotificationComponent = FC<ColdEmailNotificationProps> & {
  PreviewProps: ColdEmailNotificationProps;
};

const ColdEmailNotification: ColdEmailNotificationComponent = ({
  baseUrl = "https://www.getinboxzero.com",
}: ColdEmailNotificationProps) => {
  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto w-full max-w-[600px] p-0">
            <Section className="p-8 text-center">
              <Link className="text-[15px]" href={baseUrl}>
                <Img
                  alt="Inbox Zero"
                  className="mx-auto my-0"
                  height="40"
                  src={"https://www.getinboxzero.com/icon.png"}
                  width="40"
                />
              </Link>
              <Text className="mx-0 mt-4 mb-8 p-0 text-center font-normal text-2xl">
                <span className="font-semibold tracking-tighter">
                  Inbox Zero
                </span>
              </Text>
            </Section>

            <Section className="px-8 pb-8">
              <Text className="mt-0 mb-4 text-[16px] text-gray-700">
                The recipient uses{" "}
                <Link className="text-blue-600 underline" href={baseUrl}>
                  Inbox Zero
                </Link>{" "}
                to automatically detect and filter cold emails from first-time
                senders.
              </Text>
              <Text className="mt-0 mb-4 text-[16px] text-gray-700">
                Your email was identified as unsolicited outreach and has been
                filtered.
              </Text>
              <Text className="mt-0 mb-0 text-[16px] text-gray-700">
                If this was sent in error or you need to reach them, please try
                an alternative contact method.
              </Text>
            </Section>

            <Hr className="my-6 border-gray-200 border-solid" />
            <Section className="mt-4 mb-8 text-center text-gray-500 text-sm">
              <Text className="m-0">
                This is an automated message from{" "}
                <Link className="text-blue-600 underline" href={baseUrl}>
                  Inbox Zero
                </Link>
                .
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ColdEmailNotification;

ColdEmailNotification.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
};
