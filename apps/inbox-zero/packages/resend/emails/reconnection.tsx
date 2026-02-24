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

export type ReconnectionEmailProps = {
  baseUrl: string;
  email: string;
  unsubscribeToken: string;
};

type ReconnectionEmailComponent = FC<ReconnectionEmailProps> & {
  PreviewProps: ReconnectionEmailProps;
};

const ReconnectionEmail: ReconnectionEmailComponent = ({
  baseUrl = "https://www.getinboxzero.com",
  email,
  unsubscribeToken,
}: ReconnectionEmailProps) => {
  const reconnectUrl = `${baseUrl}/accounts`;

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

              <Text className="mx-0 mt-0 mb-8 p-0 text-center font-normal text-2xl text-gray-900">
                Action Required: Your email account was disconnected
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-4 pb-4">
              <Text className="mt-0 mb-6 text-[16px] text-gray-700">Hi,</Text>

              <Text className="mt-0 mb-6 text-[16px] text-gray-700">
                The connection for <strong>{email}</strong> to Inbox Zero was
                disconnected. This usually happens after a password change, if
                access was revoked, or if your 6-month approval period has
                expired.
              </Text>

              <Text className="mt-0 mb-8 text-[16px] text-gray-700">
                Please reconnect your account to resume your automated email
                rules and AI assistant features.
              </Text>

              {/* CTA Button */}
              <Section className="mb-8 text-center">
                <Button
                  className="box-border inline-block rounded-[8px] bg-blue-600 px-8 py-4 font-semibold text-[16px] text-white no-underline"
                  href={reconnectUrl}
                >
                  Reconnect Now
                </Button>
              </Section>

              <Text className="mt-0 mb-8 text-[14px] text-gray-500">
                If you didn't expect this, it's likely a security measure from
                your email provider. Reconnecting is safe and only takes a few
                seconds.
              </Text>
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

export default ReconnectionEmail;

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
        You're receiving this email because your email account is connected to
        Inbox Zero.
      </Text>
      <div className="mt-2">
        <Link
          className="mr-4 text-gray-500 underline"
          href={`${baseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`}
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

ReconnectionEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  email: "user@example.com",
  unsubscribeToken: "preview-token-123",
};
