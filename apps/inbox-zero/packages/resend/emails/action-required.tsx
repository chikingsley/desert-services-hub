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

export type ActionRequiredEmailProps = {
  baseUrl: string;
  email: string;
  unsubscribeToken: string;
  errorType: string;
  errorMessage: string;
  actionUrl: string;
  actionLabel: string;
};

type ActionRequiredEmailComponent = FC<ActionRequiredEmailProps> & {
  PreviewProps: ActionRequiredEmailProps;
};

const ActionRequiredEmail: ActionRequiredEmailComponent = ({
  baseUrl = "https://www.getinboxzero.com",
  email,
  unsubscribeToken,
  errorType,
  errorMessage,
  actionUrl,
  actionLabel,
}: ActionRequiredEmailProps) => {
  const fullActionUrl = actionUrl.startsWith("http")
    ? actionUrl
    : `${baseUrl}${actionUrl}`;

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
                Action Required: {errorType}
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-4 pb-4">
              <Text className="mt-0 mb-6 text-[16px] text-gray-700">Hi,</Text>

              <Text className="mt-0 mb-6 text-[16px] text-gray-700">
                We encountered an issue with your Inbox Zero account (
                <strong>{email}</strong>):
              </Text>

              <Text className="mt-0 mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-[16px] text-gray-700">
                {errorMessage}
              </Text>

              <Text className="mt-0 mb-8 text-[16px] text-gray-700">
                Your automated email rules and AI assistant features are paused
                until this is resolved.
              </Text>

              {/* CTA Button */}
              <Section className="mb-8 text-center">
                <Button
                  className="box-border inline-block rounded-[8px] bg-blue-600 px-8 py-4 font-semibold text-[16px] text-white no-underline"
                  href={fullActionUrl}
                >
                  {actionLabel}
                </Button>
              </Section>

              <Text className="mt-0 mb-8 text-[14px] text-gray-500">
                If you need help, please visit our support page or reply to this
                email.
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

export default ActionRequiredEmail;

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

ActionRequiredEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  email: "user@example.com",
  unsubscribeToken: "preview-token-123",
  errorType: "API Key Issue",
  errorMessage:
    "Your OpenAI API key is invalid. Please update it in your settings to continue using AI features.",
  actionUrl: "/settings",
  actionLabel: "Update API Key",
};
