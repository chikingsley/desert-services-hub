/**
 * Unified Email Triage — Prompt Builder
 *
 * Assembles the full LLM prompt from the gathered context. The prompt includes
 * the email, thread, documents, attachments, and candidate projects/estimates.
 */

import {
  TRIAGE_CATEGORY_GUIDANCE,
  TRIAGE_SUBCATEGORY_GUIDANCE,
} from "./triage-taxonomy";
import type { TriageContext } from "./types";

function formatGuidanceLines(
  guidance: Record<string, string>,
  labelTransform: (label: string) => string = (label) => label
): string {
  return Object.entries(guidance)
    .map(
      ([label, description]) => `- ${labelTransform(label)} — ${description}`
    )
    .join("\n");
}

const CATEGORY_LINES = formatGuidanceLines(TRIAGE_CATEGORY_GUIDANCE);
const SUBCATEGORY_LINES = formatGuidanceLines(
  TRIAGE_SUBCATEGORY_GUIDANCE,
  (label) => label
);

const SYSTEM_INSTRUCTIONS = `You classify incoming emails for Desert Services, a dust control and environmental services company based in Arizona.

You are given:
1. The email (full body, metadata)
2. Conversation thread (other emails in this thread, chronological)
3. Extracted documents (parsed content from attachments in this thread)
4. Candidate projects and estimates (possible matches from the database)

Classify the email and determine which project/estimate it belongs to.

Return a JSON object with these fields:
{
  "category": "<one of the category values listed below>",
  "subcategory": "<one of the subcategory values listed below, or null>",
  "project_id": <number from candidates list, or null>,
  "estimate_id": <number from candidates list, or null>,
  "confidence": <number 0.0 to 1.0>,
  "reason": "<brief explanation, max 200 chars>"
}

CATEGORIES:
${CATEGORY_LINES}

SUBCATEGORIES (use when applicable, otherwise null):
${SUBCATEGORY_LINES}

RULES:
- Only pick project_id/estimate_id from the provided candidates. Never invent IDs.
- If unsure between candidates, return null for that field.
- PAYMENT means a payment processor confirmation (e.g. PointAndPay receipt), NOT an invoice or billing request.
- DUST_PERMIT + permit_issued = official "your permit has been approved/issued" from a government authority (Maricopa County, ADEQ).
- CONTRACT = actual contract documents received as attachments, not a discussion about contracts.
- Use the thread context, extracted documents, and attachment content to inform your decision.
- If the thread already has a linked project, that's strong evidence the email belongs to the same project.
- Return UNKNOWN if genuinely unclear. Do not force a classification.
- Return ONLY valid JSON, no markdown fences, no other text.`;

export function buildTriagePrompt(context: TriageContext): string {
  const payload = buildPayload(context);
  return `${SYSTEM_INSTRUCTIONS}\n\n${JSON.stringify(payload, null, 2)}`;
}

function buildPayload(context: TriageContext): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    email: buildEmailSection(context),
  };

  if (context.thread.length > 0) {
    payload.thread = context.thread.map((msg) => ({
      from: msg.from,
      subject: msg.subject,
      body_preview: msg.bodyPreview,
      received_at: msg.receivedAt,
      linked_project_id: msg.projectId,
      classification: msg.classification,
    }));
  }

  if (context.documents.length > 0) {
    payload.extracted_documents = context.documents.map((doc) => ({
      document_type: doc.documentType,
      summary: doc.summary,
      file_name: doc.fileName,
      ...doc.keyFields,
    }));
  }

  if (context.attachments.length > 0) {
    payload.attachment_content = context.attachments.map((att) => ({
      name: att.name,
      content_type: att.contentType,
      text: att.extractedText,
    }));
  }

  if (context.candidates.projects.length > 0) {
    payload.candidate_projects = context.candidates.projects.map((p) => ({
      id: p.id,
      name: p.name,
      contractor: p.contractor,
      address: p.address,
      score: p.score,
    }));
  }

  if (context.candidates.estimates.length > 0) {
    payload.candidate_estimates = context.candidates.estimates.map((e) => ({
      id: e.id,
      estimate_number: e.estimateNumber,
      job_name: e.jobName,
      contractor: e.contractor,
      job_address: e.jobAddress,
      project_id: e.projectId,
      score: e.score,
    }));
  }

  return payload;
}

function buildEmailSection(context: TriageContext): Record<string, unknown> {
  const email = context.email;
  const section: Record<string, unknown> = {
    id: email.id,
    subject: email.subject,
    body: email.body,
    from: email.from,
    to: email.to,
    cc: email.cc,
    mailbox: email.mailbox,
    received_at: email.receivedAt,
    attachment_names: email.attachmentNames,
  };

  if (email.isForwarded) {
    section.is_forwarded = true;
    section.original_sender = email.originalSender;
  }

  if (email.isPlatformEmail) {
    section.is_platform_email = true;
    section.platform_name = email.platformName;
  }

  if (email.categories.length > 0) {
    section.outlook_categories = email.categories;
  }

  if (email.existingProjectId) {
    section.already_linked_project_id = email.existingProjectId;
  }

  if (email.existingClassification) {
    section.existing_classification = email.existingClassification;
  }

  return section;
}
