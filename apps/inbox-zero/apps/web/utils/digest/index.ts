import type { DigestBody } from "@/app/api/ai/digest/validation";
import type { EmailForAction } from "@/utils/ai/types";
import type { Logger } from "@/utils/logger";
import { emailToContent } from "@/utils/mail";
import type { ParsedMessage } from "@/utils/types";
import { publishToQstashQueue } from "@/utils/upstash";

export async function enqueueDigestItem({
  email,
  emailAccountId,
  actionId,
  logger,
}: {
  email: ParsedMessage | EmailForAction;
  emailAccountId: string;
  actionId?: string;
  logger: Logger;
}) {
  try {
    await publishToQstashQueue<DigestBody>({
      queueName: "digest-item-summarize",
      parallelism: 3, // Allow up to 3 concurrent jobs from this queue
      path: "/api/ai/digest",
      body: {
        emailAccountId,
        actionId,
        message: {
          id: email.id,
          threadId: email.threadId,
          from: email.headers.from,
          to: email.headers.to || "",
          subject: email.headers.subject,
          content: emailToContent(email),
        },
      },
    });
  } catch (error) {
    logger.error("Failed to publish to Qstash", { error });
  }
}
