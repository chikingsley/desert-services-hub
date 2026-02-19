import { db } from "@lib/db/client";
import { insertAttachment } from "@lib/db/repositories/attachment";
import {
  getBodyLinkScanState,
  isBodyLinkScanCompleteForVersion,
  recordBodyLinkScanResult,
} from "@lib/db/repositories/email";
import type { BodyLinkScanStatus } from "@lib/db/types";
import type { BodyLinkDownloadFailure } from "@lib/downloads/types";
import { downloadBodyLinkAttachmentsWithReport } from "./body-link-attachments";
import {
  type BodyLinkManualFollowupPayload,
  enqueueBodyLinkManualFollowup,
} from "./body-link-followup-queue";

export const CURRENT_BODY_LINK_SCAN_VERSION = 1;

export interface ProcessBodyLinksForEmailInput {
  bodyHtml?: string | null;
  bodyText?: string | null;
  emailId: number;
  forceRescan?: boolean;
  mailboxEmail: string;
  maxLinks?: number;
}

export interface ProcessBodyLinksForEmailResult {
  attachmentsInserted: number;
  failures: BodyLinkDownloadFailure[];
  linksAttempted: number;
  linksFound: number;
  names: string[];
  skipReason: string | null;
  skipped: boolean;
  status: BodyLinkScanStatus;
}

async function getExistingBodyLinkNames(emailId: number): Promise<string[]> {
  const rows = await db
    .query<{ file_name: string }, [number]>(
      `SELECT file_name
       FROM documents
       WHERE source = 'email_attachment'
         AND email_id = $1
         AND outlook_attachment_id LIKE 'bodylink:%'`
    )
    .all(emailId);

  return [...new Set(rows.map((row) => row.file_name))];
}

function isGatedFailure(error: string): boolean {
  const normalized = error.toLowerCase();
  return (
    normalized.includes("password protected") ||
    normalized.includes("requires captcha")
  );
}

export function toManualFollowupPayloads(params: {
  emailId: number;
  failures: BodyLinkDownloadFailure[];
  mailboxEmail: string;
}): BodyLinkManualFollowupPayload[] {
  return params.failures
    .filter((failure) => isGatedFailure(failure.error))
    .map((failure) => ({
      emailId: params.emailId,
      mailboxEmail: params.mailboxEmail,
      reason: failure.error,
      source: failure.source,
      url: failure.url,
    }));
}

function summarizeFailures(failures: BodyLinkDownloadFailure[]): string | null {
  if (failures.length === 0) {
    return null;
  }

  const summary = failures
    .slice(0, 3)
    .map((failure) => `${failure.source}: ${failure.error}`)
    .join(" | ");

  return failures.length > 3
    ? `${summary} (+${failures.length - 3} more)`
    : summary;
}

export function deriveBodyLinkScanStatus(params: {
  attachmentsInserted: number;
  failures: BodyLinkDownloadFailure[];
  linksFound: number;
}): BodyLinkScanStatus {
  if (params.linksFound === 0) {
    return "no_links";
  }

  if (params.attachmentsInserted > 0) {
    return "success";
  }

  if (params.failures.some((failure) => isGatedFailure(failure.error))) {
    return "gated";
  }

  return "failed";
}

function buildAlreadyScannedSkipResult(params: {
  linksFound: number;
  status: BodyLinkScanStatus | null;
}): ProcessBodyLinksForEmailResult {
  const status = params.status ?? "pending";
  return {
    attachmentsInserted: 0,
    failures: [],
    linksAttempted: 0,
    linksFound: params.linksFound,
    names: [],
    skipReason: `already scanned (status=${status}, version=${CURRENT_BODY_LINK_SCAN_VERSION})`,
    skipped: true,
    status,
  };
}

async function getExistingAttachmentSkipResult(
  emailId: number,
  forceRescan: boolean
): Promise<ProcessBodyLinksForEmailResult | null> {
  if (forceRescan) {
    return null;
  }

  const existingNames = await getExistingBodyLinkNames(emailId);
  if (existingNames.length === 0) {
    return null;
  }

  await recordBodyLinkScanResult({
    attachmentsAdded: existingNames.length,
    emailId,
    error: null,
    linksFound: existingNames.length,
    status: "success",
    version: CURRENT_BODY_LINK_SCAN_VERSION,
  });

  return {
    attachmentsInserted: 0,
    failures: [],
    linksAttempted: 0,
    linksFound: existingNames.length,
    names: existingNames,
    skipReason: "existing body-link attachments found",
    skipped: true,
    status: "success",
  };
}

async function insertDownloadedBodyLinkAttachments(params: {
  attachments: Awaited<
    ReturnType<typeof downloadBodyLinkAttachmentsWithReport>
  >["attachments"];
  emailId: number;
  failures: BodyLinkDownloadFailure[];
}): Promise<string[]> {
  const names: string[] = [];

  for (const attachment of params.attachments) {
    try {
      await insertAttachment({
        attachmentId: attachment.attachmentId,
        contentType: attachment.contentType,
        emailId: params.emailId,
        name: attachment.name,
        size: attachment.size,
        storageBucket: null,
        storagePath: attachment.storagePath,
      });
      names.push(attachment.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      params.failures.push({
        error: `db insert failed: ${message}`,
        source: attachment.source,
        url: attachment.sourceUrl,
      });
    }
  }

  return names;
}

async function enqueueGatedManualFollowups(params: {
  emailId: number;
  failures: BodyLinkDownloadFailure[];
  mailboxEmail: string;
  status: BodyLinkScanStatus;
}): Promise<void> {
  if (params.status !== "gated") {
    return;
  }

  const followups = toManualFollowupPayloads({
    emailId: params.emailId,
    failures: params.failures,
    mailboxEmail: params.mailboxEmail,
  });

  for (const followup of followups) {
    try {
      await enqueueBodyLinkManualFollowup(followup);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[email:body-links] failed to enqueue manual follow-up for email ${params.emailId}: ${message}`
      );
    }
  }
}

export async function processBodyLinksForEmail(
  input: ProcessBodyLinksForEmailInput
): Promise<ProcessBodyLinksForEmailResult> {
  const forceRescan = input.forceRescan ?? false;
  const state = await getBodyLinkScanState(input.emailId);
  if (
    !forceRescan &&
    isBodyLinkScanCompleteForVersion(state, CURRENT_BODY_LINK_SCAN_VERSION)
  ) {
    return buildAlreadyScannedSkipResult({
      linksFound: state?.linksFound ?? 0,
      status: state?.status ?? null,
    });
  }

  const existingAttachmentSkip = await getExistingAttachmentSkipResult(
    input.emailId,
    forceRescan
  );
  if (existingAttachmentSkip) {
    return existingAttachmentSkip;
  }

  const report = await downloadBodyLinkAttachmentsWithReport({
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText,
    emailId: input.emailId,
    mailboxEmail: input.mailboxEmail,
    maxLinks: input.maxLinks,
  });
  const failures = [...report.failures];
  const names = await insertDownloadedBodyLinkAttachments({
    attachments: report.attachments,
    emailId: input.emailId,
    failures,
  });

  const status = deriveBodyLinkScanStatus({
    attachmentsInserted: names.length,
    failures,
    linksFound: report.linksFound,
  });
  await recordBodyLinkScanResult({
    attachmentsAdded: names.length,
    emailId: input.emailId,
    error: summarizeFailures(failures),
    linksFound: report.linksFound,
    status,
    version: CURRENT_BODY_LINK_SCAN_VERSION,
  });

  await enqueueGatedManualFollowups({
    emailId: input.emailId,
    failures,
    mailboxEmail: input.mailboxEmail,
    status,
  });

  return {
    attachmentsInserted: names.length,
    failures,
    linksAttempted: report.linksAttempted,
    linksFound: report.linksFound,
    names,
    skipReason: null,
    skipped: false,
    status,
  };
}
