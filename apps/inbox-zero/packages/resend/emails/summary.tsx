import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

type EmailItem = {
  from: string;
  subject: string;
  sentAt: Date;
};

export interface SummaryEmailProps {
  awaitingReply?: EmailItem[];
  awaitingReplyCount?: number;
  baseUrl: string;
  coldEmailers: EmailItem[];
  needsAction?: EmailItem[];
  needsActionCount?: number;
  needsReply?: EmailItem[];
  // Reply tracker stats
  needsReplyCount?: number;
  unsubscribeToken: string;
}

export default function SummaryEmail(props: SummaryEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    coldEmailers,
    needsReplyCount,
    awaitingReplyCount,
    needsActionCount,
    needsReply,
    awaitingReply,
    needsAction,
    unsubscribeToken,
  } = props;

  return (
    <Html>
      <Head />
      <Preview>
        See your follow-ups, cold emails and pending items for this week
      </Preview>
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

              <Heading className="my-4 font-medium text-4xl leading-tight">
                Your Weekly Update
              </Heading>
              <Text className="mb-8 text-lg leading-8">
                Let's take a look at how you're managing your inbox this week.
              </Text>
            </Section>

            <ReplyTracker
              awaitingReply={awaitingReply ?? []}
              awaitingReplyCount={awaitingReplyCount ?? 0}
              baseUrl={baseUrl}
              needsAction={needsAction ?? []}
              needsActionCount={needsActionCount ?? 0}
              needsReply={needsReply ?? []}
              needsReplyCount={needsReplyCount ?? 0}
            />

            <ColdEmails baseUrl={baseUrl} coldEmailers={coldEmailers} />

            <Footer baseUrl={baseUrl} unsubscribeToken={unsubscribeToken} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

SummaryEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  coldEmailers: [
    {
      from: "James <james@example.com>",
      subject: "",
      sentAt: new Date("2024-03-15"),
    },
    {
      from: "Matt <matt@example.com>",
      subject: "",
      sentAt: new Date("2024-03-15"),
    },
    {
      from: "Paul <paul@example.com>",
      subject: "",
      sentAt: new Date("2024-03-15"),
    },
  ],
  needsReplyCount: 2,
  awaitingReplyCount: 3,
  // needsActionCount: 1,
  needsReply: [
    {
      from: "Sarah Chen <sarah@company.com>",
      subject: "Project Timeline Update",
      sentAt: new Date("2024-03-15"),
    },
    {
      from: "Alex Johnson <alex@startup.io>",
      subject: "Partnership Opportunity",
      sentAt: new Date("2024-03-18"),
    },
  ],
  awaitingReply: [
    {
      from: "Michael Smith <michael@corp.com>",
      subject: "Contract Review",
      sentAt: new Date("2024-03-10"),
    },
    {
      from: "Emma Davis <emma@tech.co>",
      subject: "API Integration Questions",
      sentAt: new Date("2024-03-12"),
    },
  ],
  // needsAction: [
  //   {
  //     from: "John Doe <john@example.com>",
  //     subject: "Project Status Update",
  //     sentAt: new Date("2024-03-15"),
  //   },
  // ],
  unsubscribeToken: "123",
} satisfies SummaryEmailProps;

function ReplyTracker({
  needsReplyCount,
  awaitingReplyCount,
  needsActionCount,
  needsReply,
  awaitingReply,
  needsAction,
  baseUrl,
}: {
  needsReplyCount: number;
  awaitingReplyCount: number;
  needsActionCount: number;
  needsReply: EmailItem[];
  awaitingReply: EmailItem[];
  needsAction: EmailItem[];
  baseUrl: string;
}) {
  const showNeedsAction = needsActionCount > 0;
  const columnWidth = showNeedsAction ? "w-1/3" : "w-1/2";

  const hasReplyTrackerItems =
    needsReplyCount > 0 || awaitingReplyCount > 0 || needsActionCount > 0;

  if (!hasReplyTrackerItems) {
    return null;
  }

  return (
    <Section className="rounded-2xl bg-[#ffb366]/10 bg-[radial-gradient(circle_at_bottom_right,#ffb366_0%,transparent_60%)] p-8 text-center">
      <Heading className="m-0 font-medium text-3xl text-[#a63b00]">
        Email Follow-ups
      </Heading>

      <Row className="mt-5">
        <Column className={`${columnWidth} text-center`}>
          <Text className="font-medium text-[#a63b00] text-sm">Need Reply</Text>
          <Text className="my-1 font-bold text-4xl text-gray-900">
            {needsReplyCount}
          </Text>
        </Column>
        <Column className={`${columnWidth} text-center`}>
          <Text className="font-medium text-[#a63b00] text-sm">
            Awaiting Reply
          </Text>
          <Text className="my-1 font-bold text-4xl text-gray-900">
            {awaitingReplyCount}
          </Text>
        </Column>
        {showNeedsAction && (
          <Column className={`${columnWidth} text-center`}>
            <Text className="font-medium text-[#a63b00] text-sm">
              Needs Action
            </Text>
            <Text className="my-1 font-bold text-4xl text-gray-900">
              {needsActionCount}
            </Text>
          </Column>
        )}
      </Row>

      <EmailList
        description="Emails waiting for your reply"
        emails={needsReply}
      />

      <EmailList
        description="Emails you're waiting for a reply on"
        emails={awaitingReply}
      />

      {showNeedsAction && (
        <EmailList description="Emails that need action" emails={needsAction} />
      )}

      {hasReplyTrackerItems && (
        <Section className="mt-[32px] mb-[32px] text-center">
          <Button
            href={`${baseUrl}/reply-tracker`}
            style={{
              background: "#000",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: "5px",
            }}
          >
            View All
          </Button>
        </Section>
      )}
    </Section>
  );
}

function ColdEmails({
  coldEmailers,
  baseUrl,
}: {
  coldEmailers: EmailItem[];
  baseUrl: string;
}) {
  if (!coldEmailers.length) {
    return null;
  }

  return (
    <Section className="my-6 rounded-2xl bg-[#3b82f6]/5 bg-[radial-gradient(circle_at_bottom_right,#3b82f6_0%,transparent_60%)] p-8 text-center">
      <Heading className="m-0 font-medium text-3xl text-[#1e40af]">
        Cold Emails
      </Heading>
      <Text className="my-4 font-bold text-5xl text-gray-900">
        {coldEmailers.length}
      </Text>
      <Text className="mb-4 text-gray-900 text-xl">received this week</Text>

      {coldEmailers.length > 0 && (
        <EmailList description="" emails={coldEmailers} />
      )}

      {coldEmailers.length > 0 && (
        <Section className="mt-[32px] mb-[32px] text-center">
          <Button
            href={`${baseUrl}/cold-email-blocker`}
            style={{
              background: "#000",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: "5px",
            }}
          >
            View Cold Emails
          </Button>
        </Section>
      )}
    </Section>
  );
}

function Footer({
  baseUrl,
  unsubscribeToken,
}: {
  baseUrl: string;
  unsubscribeToken: string;
}) {
  return (
    <Section>
      <Text>
        You're receiving this email because you're subscribed to Inbox Zero
        stats updates. You can change this in your{" "}
        <Link
          className="text-[15px]"
          href={`${baseUrl}/settings#email-updates`}
        >
          settings
        </Link>
        .
      </Text>

      <Link
        className="text-[15px]"
        href={`${baseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`}
      >
        Unsubscribe from emails like this
      </Link>
    </Section>
  );
}

function EmailCard({ email }: { email: EmailItem }) {
  return (
    <Section className="my-3 rounded-lg border border-[#ffb366]/20 bg-white/50 p-4 text-left shadow-sm">
      <Row>
        <Column>
          <Text className="m-0 font-semibold">{email.from}</Text>
          <Text className="m-0 text-gray-600">{email.subject}</Text>
        </Column>
        <Column align="right">
          <Text className="m-0 text-gray-500 text-sm">
            {email.sentAt ? new Date(email.sentAt).toLocaleDateString() : ""}
          </Text>
        </Column>
      </Row>
    </Section>
  );
}

function EmailList({
  description,
  emails,
}: {
  description: string;
  emails: EmailItem[];
}) {
  if (emails.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <Text className="mb-4 font-medium text-gray-900 text-lg">
        {description}
      </Text>
      {emails.map((email) => (
        <EmailCard email={email} key={email.from + email.subject} />
      ))}
    </div>
  );
}
