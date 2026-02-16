import type { OpencodeOptions } from "./opencode";
import { runOpencodeJsonPrompt } from "./opencode";
import type {
  PermitIntent,
  PermitIntentHeuristic,
  PermitIntentModelResult,
  PermitIntentRow,
} from "./permit-intent-types";

const PERMIT_SIGNAL_RE =
  /\bdust\s*control\s*permit\b|\bdust\s*permit\b|\badeq\s*permit\b|\bnotice[_\s]+of[_\s]+intent\b|\bnoi\b|azc\d{5,}/i;
const REQUEST_COPY_RE =
  /\b(send|provide|attach|forward|share)\b.*\b(copy|pdf|permit|noi|document|file|attachment)\b|\b(copy|pdf|permit|noi|document|file|attachment)\b.*\b(send|provide|attach|forward|share)\b|\bneed\b.*\b(copy|pdf|document|file|attachment)\b/i;
const STATUS_RE =
  /\bstatus\b|\bupdate\b|\bwhere\b.*\b(permit|noi)\b|\b(issued|filed|submitted)\b\??|\bfollow[\s-]?up\b|\beta\b/i;
const START_OR_FILE_RE =
  /\b(start|begin|file|filing|submit|submitted)\b.*\b(permit|noi)\b|\bneed\b.*\b(permit|noi)\b|\bdust\s*permit\s*needed\b|\basap\b.*\b(permit|noi)\b/i;
const CORRECTION_RE =
  /\bmissing\b|\bleft off\b|\bnot included\b|\bcant read\b|\bcannot read\b|\bincorrect\b|\bwrong\b|\brevise\b|\bupdate stickers?\b/i;
const MEETING_RESPONSE_SUBJECT_RE = /^(accepted|declined|tentative):/i;

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "y"].includes(value.toLowerCase());
  }
  return false;
}

function normalizeIntent(value: unknown): PermitIntent | null {
  if (typeof value !== "string") {
    return null;
  }
  const raw = value.trim().toLowerCase();
  const aliases: Record<string, PermitIntent> = {
    action_request: "action_request_start_or_file",
    action_request_start: "action_request_start_or_file",
    correction: "missing_info_or_correction",
    missing_info: "missing_info_or_correction",
    new_filing_request: "action_request_start_or_file",
    not_relevant: "not_related",
    other: "other_permit_related",
    request_copy: "request_document_copy",
    request_existing_document: "request_document_copy",
    request_status: "request_status_update",
    status_check: "request_status_update",
  };

  if (raw in aliases) {
    return aliases[raw];
  }

  const direct = new Set<PermitIntent>([
    "request_document_copy",
    "request_status_update",
    "action_request_start_or_file",
    "missing_info_or_correction",
    "other_permit_related",
    "not_related",
  ]);
  return direct.has(raw as PermitIntent) ? (raw as PermitIntent) : null;
}

export function parseAttachmentNames(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0);
    }
  } catch {
    // fallback below
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function buildPrompt(
  row: PermitIntentRow,
  heuristic: PermitIntentHeuristic
): string {
  const payload = {
    email: {
      attachmentNames: parseAttachmentNames(row.attachment_names).slice(0, 20),
      bodyPreview: truncate(row.body_preview ?? "", 1200),
      classification: row.classification,
      conversationId: row.conversation_id,
      fromDomain: row.from_domain,
      fromEmail: row.from_email,
      id: row.id,
      projectId: row.project_id,
      receivedAt: row.received_at,
      subject: row.subject,
    },
    heuristic,
  };

  return [
    "You classify external incoming email intent for permit/NOI processing triage.",
    "This is dry-run analysis only. Be strict and avoid over-classifying.",
    "Allowed intents:",
    "- request_document_copy",
    "- request_status_update",
    "- action_request_start_or_file",
    "- missing_info_or_correction",
    "- other_permit_related",
    "- not_related",
    "Return JSON only with keys: intent, confidence, reason, needsHumanReview.",
    "",
    JSON.stringify(payload),
  ].join("\n");
}

export function classifyPermitIntentHeuristic(
  row: PermitIntentRow
): PermitIntentHeuristic {
  if (MEETING_RESPONSE_SUBJECT_RE.test(row.subject ?? "")) {
    return {
      hasPermitSignal: false,
      intent: "not_related",
      reason: "calendar_response_subject",
    };
  }

  const signalText = [
    row.subject,
    row.body_preview,
    ...parseAttachmentNames(row.attachment_names),
  ]
    .filter(Boolean)
    .join("\n");
  const hasPermitSignal = PERMIT_SIGNAL_RE.test(signalText);

  if (!hasPermitSignal) {
    return {
      hasPermitSignal,
      intent: "not_related",
      reason: "no_permit_or_noi_signal",
    };
  }
  if (CORRECTION_RE.test(signalText)) {
    return {
      hasPermitSignal,
      intent: "missing_info_or_correction",
      reason: "missing_or_correction_signal",
    };
  }
  if (REQUEST_COPY_RE.test(signalText)) {
    return {
      hasPermitSignal,
      intent: "request_document_copy",
      reason: "send_or_provide_signal",
    };
  }
  if (STATUS_RE.test(signalText)) {
    return {
      hasPermitSignal,
      intent: "request_status_update",
      reason: "status_or_followup_signal",
    };
  }
  if (START_OR_FILE_RE.test(signalText)) {
    return {
      hasPermitSignal,
      intent: "action_request_start_or_file",
      reason: "start_or_file_signal",
    };
  }
  return {
    hasPermitSignal,
    intent: "other_permit_related",
    reason: "general_permit_reference",
  };
}

export async function classifyPermitIntentWithSpark(
  row: PermitIntentRow,
  heuristic: PermitIntentHeuristic,
  options: OpencodeOptions
): Promise<PermitIntentModelResult | null> {
  const parsed = await runOpencodeJsonPrompt(
    buildPrompt(row, heuristic),
    options
  );
  if (!parsed) {
    return null;
  }

  const intent = normalizeIntent(parsed.intent);
  if (!intent) {
    return null;
  }

  const confidenceRaw = parsed.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0;
  const reasonRaw = parsed.reason;

  return {
    confidence,
    intent,
    needsHumanReview: toBoolean(parsed.needsHumanReview),
    reason:
      typeof reasonRaw === "string" ? truncate(reasonRaw.trim(), 320) : "",
  };
}
