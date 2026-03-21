export interface EmailTemplate {
  body: string;
  subject: string;
}

export interface SignatureBlock {
  email?: string;
  mailbox?: string;
  name?: string;
  phone?: string;
  title?: string;
}

export type RevisionItemType =
  | "MARKUP"
  | "CLARIFICATION"
  | "QUESTION"
  | "SOV"
  | "EXCLUSION";

export interface RevisionItem {
  text: string;
  type: RevisionItemType;
  where?: string;
}

export type InternalContractsStatus =
  | "ready_to_sign"
  | "contract_in_progress"
  | "contract_signed";

export interface ServiceSovSection {
  lines: string[];
  mentions?: string[];
  serviceName: string;
}

export interface ContractMarkupResponseInput {
  attachmentNote?: string;
  introLine?: string;
  projectName: string;
  recipientName?: string;
  revisions: RevisionItem[];
  signature?: SignatureBlock;
  subjectPrefix?: string;
}

export interface InternalContractsHandoffInput {
  accountLabel?: string;
  accountName?: string;
  additionalNotes?: string[];
  assignmentNote?: string;
  billingMentions?: string[];
  billingNotes?: string[];
  certifiedPayrollNote?: string;
  certifiedPayrollRequired?: boolean;
  contacts?: string[];
  mondayNote?: string;
  primaryContact?: string;
  primaryContactLabel?: string;
  projectAddress?: string;
  projectName: string;
  quickbooksNote?: string;
  routingNotes?: string[];
  serviceSections: ServiceSovSection[];
  signature?: SignatureBlock;
  sovTotal?: string;
  status: InternalContractsStatus;
  statusNote?: string;
}

const DEFAULT_SIGNATURE: Required<SignatureBlock> = {
  email: "chi@desertservices.net",
  mailbox: "chi@desertservices.net",
  name: "Chi Ejimofor",
  phone: "(480) 513-8986",
  title: "Project Coordinator",
};

function withDefaults(
  signature?: SignatureBlock
): Required<SignatureBlock> {
  return {
    ...DEFAULT_SIGNATURE,
    ...signature,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrap(content: string): string {
  return `<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body>${content}</body>
</html>`;
}

function signatureBlock(signature?: SignatureBlock): string {
  const s = withDefaults(signature);
  return `<div><br></div>
<div>Best,</div>
<div><br></div>
<div>${escapeHtml(s.name)}</div>
<div>${escapeHtml(s.title)}</div>
<div>Desert Services LLC</div>
<div>E: ${escapeHtml(s.email)}</div>
<div>O: ${escapeHtml(s.phone)}</div>`;
}

function revisionLine(item: RevisionItem): string {
  const where = item.where?.trim();
  const whereText = where ? ` ${escapeHtml(where)}:` : ":";
  return `<li><div><b>[${item.type}]</b>${whereText} ${escapeHtml(
    item.text
  )}</div></li>`;
}

function line(value: string): string {
  return `<div>${escapeHtml(value)}</div>`;
}

function spacer(): string {
  return "<div><br></div>";
}

function joinParts(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" ");
}

function addLines(blocks: string[], values: Array<string | undefined>): void {
  values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .forEach((value) => blocks.push(line(value)));
}

function billingHeading(mentions?: string[]): string {
  const mentionText = mentions
    ?.map((mention) => mention.trim())
    .filter(Boolean)
    .join(" ");

  return mentionText ? `--Billing ${mentionText}--` : "--Billing--";
}

export function contractMarkupResponseEmail(
  input: ContractMarkupResponseInput
): EmailTemplate {
  const recipientName = input.recipientName?.trim() || "Team";
  const introLine = input.introLine?.trim() || "A few notes below:";
  const subjectPrefix =
    input.subjectPrefix?.trim() || `${input.projectName} Contract Markup`;
  const attachmentLine =
    input.attachmentNote?.trim() ||
    `Please see the markup attached for ${input.projectName}.`;

  return {
    subject: `${subjectPrefix} / Revisions`,
    body: wrap(
      `<div>Hi ${escapeHtml(recipientName)},</div>
<div><br></div>
<div>${escapeHtml(attachmentLine)}</div>
<div><br></div>
<div><u><b>${escapeHtml(input.projectName)}</b></u></div>
<div><br></div>
<div>${escapeHtml(introLine)}</div>
<ul style="margin-top:0; margin-bottom:0;">${input.revisions
        .map(revisionLine)
        .join("")}</ul>
${signatureBlock(input.signature)}`
    ),
  };
}

function subjectForInternalContracts(
  status: InternalContractsStatus,
  projectName: string,
  accountName?: string
): string {
  const suffix = accountName?.trim()
    ? `${projectName} - ${accountName}`
    : projectName;

  if (status === "ready_to_sign") {
    return `READY TO SIGN: ${suffix}`;
  }
  if (status === "contract_in_progress") {
    return `CONTRACT IN PROGRESS: ${suffix}`;
  }
  return `CONTRACT SIGNED: ${suffix}`;
}

function statusLine(status: InternalContractsStatus, note?: string): string {
  const trimmedNote = note?.trim();

  if (status === "ready_to_sign") {
    return trimmedNote
      ? `READY TO SIGN - ${trimmedNote}`
      : "READY TO SIGN - ready for signature.";
  }

  if (status === "contract_in_progress") {
    return trimmedNote
      ? `REDLINES - ${trimmedNote}`
      : "REDLINES - Contract is in progress.";
  }

  return trimmedNote
    ? `CONTRACT SIGNED - ${trimmedNote}`
    : "CONTRACT SIGNED - fully executed.";
}

function renderServiceSection(section: ServiceSovSection): string[] {
  const blocks = [
    line(joinParts([section.serviceName, ...(section.mentions ?? [])])),
  ];

  addLines(blocks, section.lines);
  return blocks;
}

export function internalContractsHandoffEmail(
  input: InternalContractsHandoffInput
): EmailTemplate {
  const blocks: string[] = [];
  const accountLabel = input.accountLabel?.trim() || "Project Account";
  const primaryContactLabel =
    input.primaryContactLabel?.trim() || "Project Contact";
  const sovHeading = input.sovTotal?.trim()
    ? `SOV (${input.sovTotal.trim()})`
    : "SOV";
  const certifiedPayrollRequired = Boolean(input.certifiedPayrollRequired);
  const certifiedPayrollNote = input.certifiedPayrollNote?.trim();

  if (certifiedPayrollRequired || certifiedPayrollNote) {
    blocks.push(
      line(
        certifiedPayrollRequired
          ? "CERTIFIED PAYROLL REQUIRED"
          : "Certified Payroll"
      )
    );

    if (certifiedPayrollNote) {
      blocks.push(line(certifiedPayrollNote));
    }

    blocks.push(spacer());
  }

  addLines(blocks, [
    `Project Name: ${input.projectName}`,
    input.accountName ? `${accountLabel}: ${input.accountName}` : undefined,
    input.projectAddress ? `Project Address: ${input.projectAddress}` : undefined,
    input.primaryContact
      ? `${primaryContactLabel}: ${input.primaryContact}`
      : undefined,
  ]);

  if (input.contacts?.length) {
    blocks.push(spacer());
    blocks.push(line("--Project Contacts--"));
    addLines(blocks, input.contacts);
  }

  blocks.push(spacer());
  blocks.push(line(sovHeading));
  input.serviceSections.forEach((section) => {
    renderServiceSection(section).forEach((entry) => blocks.push(entry));
  });

  if (input.billingNotes?.length) {
    blocks.push(spacer());
    blocks.push(line(billingHeading(input.billingMentions)));
    addLines(blocks, input.billingNotes);
  }

  blocks.push(spacer());
  blocks.push(line(statusLine(input.status, input.statusNote)));

  addLines(blocks, [
    input.assignmentNote,
    input.quickbooksNote,
    input.mondayNote,
  ]);
  addLines(blocks, input.routingNotes ?? []);
  addLines(blocks, input.additionalNotes ?? []);

  return {
    subject: subjectForInternalContracts(
      input.status,
      input.projectName,
      input.accountName
    ),
    body: wrap(`${blocks.join("\n")}${signatureBlock(input.signature)}`),
  };
}
