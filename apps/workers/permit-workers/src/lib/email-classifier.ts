/**
 * Email Classifier for Dust Permit Requests
 *
 * Uses a local LLM (Qwen/Llama via llama.cpp) to classify incoming emails
 * as dust permit related or not, and determine the intent type.
 *
 * This is the first layer of the email processing funnel - cheap and fast
 * classification before expensive orchestrator processing.
 */

import { z } from "zod";

// =============================================================================
// Types
// =============================================================================

export const EmailIntentSchema = z.enum([
  "intake", // New permit request
  "renewal", // Permit renewal
  "revision", // Modification/revision
  "contact", // Contact update
  "notification", // County notification (issued/closed)
  "ignore", // Not dust permit related
]);

export type EmailIntent = z.infer<typeof EmailIntentSchema>;

export const ClassificationResultSchema = z.object({
  is_dust_permit: z.boolean(),
  intent: EmailIntentSchema,
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export interface EmailInput {
  subject: string;
  from: string;
  body: string;
}

export interface ClassifierConfig {
  endpoint: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: ClassifierConfig = {
  endpoint: "https://llama.peacockery.studio/v1/chat/completions",
  model: "llama",
  maxTokens: 400,
  temperature: 0.1,
};

const JSON_EXTRACT_REGEX = /\{[^}]+\}/;

const CLASSIFIER_PROMPT = `Classify this email. Is it about a dust permit action?

If yes, determine the intent:
- intake: New permit request ("submit the dust permit", "need a permit")
- renewal: Permit renewal ("renewed", "expires", "expiration")
- revision: Modification ("adjustment", "modify", "update the permit")
- contact: Contact update ("update contact info")
- notification: County notification (from maricopa.gov, "Permit Issued" or "Permit Closed")
- ignore: Not about dust permits

Respond with ONLY this JSON, nothing else:
{"is_dust_permit": true/false, "intent": "intake/renewal/revision/contact/notification/ignore"}

Email:
Subject: {{subject}}
From: {{from}}
Body: {{body}}`;

// =============================================================================
// Public Functions
// =============================================================================

/**
 * Classify an email to determine if it's dust permit related and what type.
 *
 * @param email - Email subject, from, and body
 * @param config - Optional classifier configuration
 * @returns Classification result with is_dust_permit and intent
 */
export async function classifyEmail(
  email: EmailInput,
  config?: Partial<ClassifierConfig>
): Promise<ClassificationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const prompt = CLASSIFIER_PROMPT.replace("{{subject}}", email.subject)
    .replace("{{from}}", email.from)
    .replace("{{body}}", truncateBody(email.body, 500));

  const response = await fetch(cfg.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
    }),
  });

  if (!response.ok) {
    throw new Error(`Classifier request failed: ${response.status}`);
  }

  const data = (await response.json()) as LLMResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in classifier response");
  }

  return parseClassificationResult(content);
}

/**
 * Quick keyword pre-filter to skip obviously non-permit emails.
 * Use this before calling classifyEmail to save API calls.
 *
 * @param email - Email subject and body
 * @returns true if email might be permit-related (should classify), false to skip
 */
export function mightBeDustPermit(
  email: Pick<EmailInput, "subject" | "from" | "body">
): boolean {
  const text = `${email.subject} ${email.from} ${email.body}`.toLowerCase();

  const keywords = [
    "dust",
    "permit",
    "renewal",
    "maricopa",
    "dust control",
    "air quality",
    "facility id",
    "d00", // Permit IDs start with D00
    "f0", // Facility IDs start with F0
  ];

  return keywords.some((kw) => text.includes(kw));
}

// =============================================================================
// Internal Types
// =============================================================================

interface LLMResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
}

// =============================================================================
// Internal Functions
// =============================================================================

function truncateBody(body: string, maxLength: number): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}...`;
}

function parseClassificationResult(content: string): ClassificationResult {
  // Try to extract JSON from the response
  const jsonMatch = content.match(JSON_EXTRACT_REGEX);
  if (!jsonMatch) {
    throw new Error(`Could not parse JSON from response: ${content}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const result = ClassificationResultSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Invalid classification result: ${result.error.message}`);
  }

  return result.data;
}
