import {
  Body,
  Button,
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

export type InvitationEmailProps = {
  baseUrl: string;
  organizationName: string;
  inviterName: string;
  invitationId: string;
  unsubscribeToken: string;
};

type InvitationEmailComponent = FC<InvitationEmailProps> & {
  PreviewProps: InvitationEmailProps;
};

const InvitationEmail: InvitationEmailComponent = ({
  baseUrl = "https://www.getinboxzero.com",
  organizationName,
  inviterName,
  invitationId,
  unsubscribeToken,
}: InvitationEmailProps) => {
  const acceptUrl = `${baseUrl}/organizations/invitations/${invitationId}/accept`;

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto w-full max-w-[600px] p-0">
            {/* Header */}
            <Section className="p-4 text-center">
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

              <Text className="mx-0 mt-0 mb-8 p-0 text-center font-normal text-2xl">
                You've been invited to join {organizationName}
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-4 pb-4">
              <Text className="mt-0 mb-6 text-center text-[18px] text-gray-900">
                You've been invited by {inviterName} to join {organizationName}.
              </Text>

              <Text className="mt-0 mb-8 text-center text-[16px] text-gray-700">
                If you'd like to accept this invitation, click the button below:
              </Text>

              {/* CTA Button */}
              <Section className="mb-8 text-center">
                <Button
                  className="box-border inline-block rounded-[8px] bg-blue-600 px-8 py-4 font-semibold text-[16px] text-white no-underline"
                  href={acceptUrl}
                >
                  Accept Invitation
                </Button>
              </Section>
            </Section>

            {/* Footer */}
            <Hr className="my-6 border-gray-200 border-solid" />
            <Footer baseUrl={baseUrl} unsubscribeToken={unsubscribeToken} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default InvitationEmail;

function Footer({
  baseUrl,
  unsubscribeToken,
}: {
  baseUrl: string;
  unsubscribeToken: string;
}) {
  return (
    <Section className="mt-8 text-center text-gray-500 text-sm">
      <Text className="m-0">
        You're receiving this email because you were invited to join an
        organization on Inbox Zero.
      </Text>
      <div className="mt-2">
        <Link
          className="mr-4 text-gray-500 underline"
          href={`${baseUrl}/api/unsubscribe?token=${unsubscribeToken}`}
        >
          Unsubscribe
        </Link>
        <Link
          className="mr-4 text-gray-500 underline"
          href={`${baseUrl}/support`}
        >
          Support
        </Link>
        <Link className="text-gray-500 underline" href={`${baseUrl}/privacy`}>
          Privacy Policy
        </Link>
      </div>
    </Section>
  );
}

InvitationEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  organizationName: "Apple Inc.",
  inviterName: "Eduardo Lelis",
  invitationId: "cmf5pzul7000lf1zrlatybrr7",
  unsubscribeToken: "preview-token-123",
};
