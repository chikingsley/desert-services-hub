#!/usr/bin/env bun
/**
 * Email Search API
 *
 * HTTP API that exposes email search for n8n workflows.
 * Features:
 * - Search all mailboxes
 * - Filter internal emails (@desertservices.net)
 * - Fetch full email bodies
 * - Format context for LLM consumption
 */
import { GraphEmailClient } from "./client";

const config = {
  azureTenantId: process.env.AZURE_TENANT_ID || "",
  azureClientId: process.env.AZURE_CLIENT_ID || "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET || "",
};

const client = new GraphEmailClient(config);
client.initAppAuth();

/** Strip HTML tags to plain text */
const stripHtml = (html: string): string =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

type SearchRequest = {
  query: string;
  limit?: number;
  includeFullBody?: boolean;
  since?: string;
  until?: string;
};

type ProcessedEmail = {
  from: string | null;
  fromName: string | null;
  subject: string;
  body: string;
  receivedDateTime: Date;
};

type RawEmail = {
  id: string;
  fromEmail: string | null;
  fromName: string | null;
  subject: string;
  bodyContent: string;
  bodyType: "html" | "text";
  receivedDateTime: Date;
};

type ExternalEmail = RawEmail & {
  mailbox: string;
};

function collectExternalEmails(
  results: { mailbox: string; emails: RawEmail[] }[]
): ExternalEmail[] {
  const externalEmails: ExternalEmail[] = [];
  for (const { mailbox, emails } of results) {
    for (const email of emails) {
      const isInternal = email.fromEmail?.includes("@desertservices.net");
      if (!isInternal) {
        externalEmails.push({ ...email, mailbox });
      }
    }
  }
  return externalEmails;
}

async function buildProcessedEmails(
  emails: ExternalEmail[],
  includeFullBody: boolean | undefined,
  maxResults: number
): Promise<ProcessedEmail[]> {
  if (includeFullBody && emails.length > 0) {
    const topEmails = emails.slice(0, maxResults);
    const processed = await Promise.all(
      topEmails.map(async (email) => {
        const full = await client.getEmail(email.id, email.mailbox);
        if (!full) {
          return {
            from: email.fromEmail,
            fromName: email.fromName,
            subject: email.subject,
            body:
              email.bodyType === "html"
                ? stripHtml(email.bodyContent)
                : email.bodyContent,
            receivedDateTime: email.receivedDateTime,
          };
        }
        return {
          from: full.fromEmail,
          fromName: full.fromName,
          subject: full.subject,
          body:
            full.bodyType === "html"
              ? stripHtml(full.bodyContent)
              : full.bodyContent,
          receivedDateTime: full.receivedDateTime,
        };
      })
    );
    return processed;
  }

  return emails.slice(0, maxResults).map((email) => ({
    from: email.fromEmail,
    fromName: email.fromName,
    subject: email.subject,
    body:
      email.bodyType === "html"
        ? stripHtml(email.bodyContent)
        : email.bodyContent,
    receivedDateTime: email.receivedDateTime,
  }));
}

Bun.serve({
  port: 3001,
  routes: {
    "/search": {
      POST: async (req) => {
        try {
          const { query, limit, includeFullBody, since, until } =
            (await req.json()) as SearchRequest;

          if (!query) {
            return Response.json(
              { error: "query is required" },
              { status: 400 }
            );
          }

          const maxResults = limit ?? 10;

          // Search all mailboxes
          const results = await client.searchAllMailboxes({
            query,
            limit: maxResults,
            since: since ? new Date(since) : undefined,
            until: until ? new Date(until) : undefined,
          });

          // Flatten and filter external emails (not from @desertservices.net)
          const externalEmails = collectExternalEmails(results);

          const processedEmails = await buildProcessedEmails(
            externalEmails,
            includeFullBody,
            maxResults
          );

          // Format context for LLM
          const emailContext = processedEmails
            .map(
              (e) =>
                `From: ${e.fromName || "Unknown"} <${e.from || "unknown"}>\nSubject: ${e.subject}\nDate: ${e.receivedDateTime}\n\n${e.body}`
            )
            .join("\n\n---EMAIL SEPARATOR---\n\n");

          return Response.json({
            emails: processedEmails,
            emailContext,
            externalEmailCount: externalEmails.length,
            hasExternalEmails: externalEmails.length > 0,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
    "/health": {
      GET: () => Response.json({ status: "ok" }),
    },
  },
});

console.log("Email Search API running on http://localhost:3001");
