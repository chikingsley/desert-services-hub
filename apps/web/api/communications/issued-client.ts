import { getEmailById } from "@email/db/email";
import { db } from "@lib/db/client";
import { createGraphClient } from "@lib/graph/mail";
import { z } from "zod";
import {
  FROM_MAILBOX,
  classifyPermit,
  permitPdfName,
  resolvePermitId,
} from "../../../trigger-dev/src/trigger/email-notifications/helpers/dust-permit-notif-helper";
import {
  escapeHtml,
  signatureHtml,
  wrapHtml,
} from "../../../trigger-dev/src/trigger/email-notifications/helpers/email-html";
import {
  findReplyCandidates,
  selectReplyRoute,
} from "../../../trigger-dev/src/trigger/email-notifications/helpers/reply-routing";

const issuedClientContextRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    draft: z.boolean().default(true),
    emailId: z.number().int().positive(),
    mode: z.literal("payment-email"),
  }),
  z.object({
    draft: z.boolean().default(true),
    mode: z.literal("manual"),
    permitId: z.string().regex(/^D\d{7}$/),
  }),
  z.object({
    draft: z.boolean().default(true),
    invoiceNumber: z.string().regex(/^IV\d+$/),
    mode: z.literal("invoice"),
  }),
]);

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).optional(),
});

const draftAttachmentSchema = z.object({
  contentBytesBase64: z.string().min(1),
  contentType: z.string().min(1),
  name: z.string().min(1),
});

const issuedClientContextResponseSchema = z.object({
  attachments: z.array(draftAttachmentSchema),
  bodyHtml: z.string().min(1),
  kind: z.literal("dust-permit-issued-client"),
  mailbox: z.string().email(),
  permitId: z.string().regex(/^D\d{7}$/),
  route: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("compose-new"),
      subject: z.string().min(1),
      to: z.array(recipientSchema).min(1),
    }),
    z.object({
      mode: z.literal("reply-all"),
      replyToMessageId: z.string().min(1),
      subject: z.string().min(1),
    }),
  ]),
  send: z.boolean(),
  type: z.enum(["issued", "renewed", "revised"]),
});

type IssuedClientContextRequest = z.infer<typeof issuedClientContextRequestSchema>;
type IssuedClientContext = z.infer<typeof issuedClientContextResponseSchema>;

interface IssuedPermitRow {
  address: string | null;
  company_name: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  facility_id: string | null;
  id: string;
  previous_app_id: string | null;
  project_id: number | null;
  project_name: string | null;
  submitted_date: string | null;
}

type NotificationType = "issued" | "renewed" | "revised";

class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

const requestError = (status: number, message: string): never => {
  throw new RequestError(status, message);
};

async function resolveChiMessageId(emailId: number): Promise<string> {
  const email = await getEmailById(emailId);
  if (!email) {
    requestError(404, `Email ${emailId} not found`);
  }

  const mailbox = await db
    .query<{ email: string }, [number]>(
      "SELECT email FROM mailboxes WHERE id = $1 LIMIT 1",
    )
    .get(email.mailboxId);

  if (mailbox?.email.toLowerCase() === FROM_MAILBOX) {
    return email.messageId;
  }

  if (!email.internetMessageId) {
    requestError(
      422,
      `Email ${emailId} is not in ${FROM_MAILBOX} and has no internet_message_id`,
    );
  }

  const sibling = await db
    .query<{ id: number }, [string, string]>(
      `SELECT e.id
       FROM emails e
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE e.internet_message_id = $1
         AND lower(m.email) = lower($2)
       LIMIT 1`,
    )
    .get(email.internetMessageId, FROM_MAILBOX);

  if (!sibling) {
    requestError(404, `Email ${emailId} has no copy in ${FROM_MAILBOX}`);
  }

  const chiEmail = await getEmailById(sibling.id);
  if (!chiEmail) {
    requestError(404, `Chi copy ${sibling.id} not found`);
  }

  return chiEmail.messageId;
}

async function downloadPermitPdfBase64(
  permitId: string,
  projectName: string,
  facilityId: string | null,
): Promise<{ contentBytesBase64: string; contentType: string; name: string } | null> {
  const row = await db
    .query<{ message_id: string }, [string, string, string]>(
      `SELECT e.message_id
       FROM emails e
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE m.email = $3
         AND lower(COALESCE(e.from_email, '')) = 'no-reply@maricopa.gov'
         AND (
           e.body_full ILIKE $1 OR e.body_preview ILIKE $1 OR e.subject ILIKE $1
           OR e.body_full ILIKE $2 OR e.body_preview ILIKE $2 OR e.subject ILIKE $2
         )
       ORDER BY e.received_at DESC
       LIMIT 1`,
    )
    .get(`%${permitId}%`, `%${projectName}%`, FROM_MAILBOX);

  if (!row) {
    return null;
  }

  const graph = createGraphClient();
  let attachments;
  try {
    attachments = await graph.getAttachments(row.message_id, FROM_MAILBOX);
  } catch {
    return null;
  }

  const pdf = attachments.find(
    (attachment) =>
      attachment.isInline !== true &&
      (/\.pdf$/i.test(attachment.name) ||
        attachment.contentType?.includes("pdf")),
  );

  if (!pdf) {
    return null;
  }

  const bytes = await graph.downloadAttachment(
    row.message_id,
    pdf.id,
    FROM_MAILBOX,
  );

  return {
    contentBytesBase64: bytes.toString("base64"),
    contentType: "application/pdf",
    name: permitPdfName(projectName, facilityId),
  };
}

function permitInfoBlock(): string {
  return (
    `<div><br></div>` +
    `<div>Important Information About Your Dust Permit:</div>` +
    `<div><br></div>` +
    `<ul style="margin-top:0; margin-bottom:0;">` +
    `<li><div><b>Annual Renewal:</b> We will reach out 2-4 weeks before expiration to discuss renewal or closeout.</div></li>` +
    `<li><div><b>Revisions:</b> If there are site changes (added acreage, new parking lots, new superintendent, etc.), the permit may need revision. Revisions are free unless acreage increases into a higher disturbance threshold.</div></li>` +
    `<li><div><b>Closeout:</b> When your project is complete and fully stabilized, let us know and we'll close out the permit with the County at no charge.</div></li>` +
    `</ul>`
  );
}

function renderIssuedEmail(
  permit: IssuedPermitRow,
  type: NotificationType,
): { bodyHtml: string; subject: string } {
  if (!permit.project_name) {
    requestError(422, `Permit ${permit.id} has no project_name`);
  }
  if (!permit.company_name) {
    requestError(422, `Permit ${permit.id} has no company_name`);
  }
  if (!permit.effective_date) {
    requestError(422, `Permit ${permit.id} has no effective_date`);
  }
  if (!permit.expiration_date) {
    requestError(422, `Permit ${permit.id} has no expiration_date`);
  }

  const permitNumber = permit.facility_id ?? permit.id;
  const actionWord = {
    issued: "issued",
    renewed: "renewed",
    revised: "revised",
  }[type];
  const statusLabel = {
    issued: "Active",
    renewed: "Renewed",
    revised: "Revised",
  }[type];
  const subjectPrefix = {
    issued: "Dust Permit Issued",
    renewed: "Dust Permit Renewed",
    revised: "Dust Permit Revised",
  }[type];

  let body =
    `<div>Team,</div><div><br></div>` +
    `<div>The dust control permit for <b>${escapeHtml(
      permit.company_name,
    )}</b> on project "<b>${escapeHtml(
      permit.project_name,
    )}</b>" has been ${actionWord} (see attached).</div>` +
    `<div><br></div>` +
    `<div>Here are the key details:</div>` +
    `<ul style="margin-top:0; margin-bottom:0;">` +
    `<li><div>Permit Status: ${statusLabel}</div></li>` +
    `<li><div>Application #: ${escapeHtml(permit.id)}</div></li>` +
    (type === "renewed" && permit.previous_app_id
      ? `<li><div>Superseded Application #: ${escapeHtml(
          permit.previous_app_id,
        )}</div></li>`
      : "") +
    `<li><div>Permit # (Facility ID): ${escapeHtml(permitNumber)}</div></li>` +
    `<li><div>Project Name: ${escapeHtml(permit.project_name)}</div></li>` +
    (permit.address
      ? `<li><div>Site Address: ${escapeHtml(permit.address)}</div></li>`
      : "") +
    `<li><div>Issue Date: ${escapeHtml(permit.effective_date)}</div></li>` +
    `<li><div>Expiration Date: ${escapeHtml(permit.expiration_date)}</div></li>` +
    `</ul>`;

  if (type === "issued" || type === "renewed") {
    body += permitInfoBlock();
  }

  body +=
    `<div><br></div><div>Let me know if you have any questions!</div>` +
    signatureHtml();

  return {
    bodyHtml: wrapHtml(body),
    subject: `${subjectPrefix} — ${permit.project_name} (${permit.id})`,
  };
}

async function buildIssuedClientContext(
  input: IssuedClientContextRequest,
): Promise<IssuedClientContext> {
  const { permitId } = await resolvePermitId(db, input);

  const permit = await db
    .query<IssuedPermitRow, [string]>(
      `SELECT id, project_name, company_name, address, facility_id,
              effective_date, expiration_date, submitted_date,
              previous_app_id, project_id
       FROM dust_permits_filed_by_desert_services
       WHERE id = $1`,
    )
    .get(permitId);

  if (!permit) {
    requestError(404, `Permit ${permitId} not found`);
  }

  const classification = await classifyPermit(
    db,
    permit.submitted_date,
    permit.previous_app_id,
  );
  const type: NotificationType =
    classification === "revision"
      ? "revised"
      : classification === "renewal"
        ? "renewed"
        : "issued";

  const template = renderIssuedEmail(permit, type);
  const candidates = await findReplyCandidates(
    db,
    permitId,
    permit.project_name,
    permit.project_id,
  );
  const route = selectReplyRoute(candidates, permitId, permit.project_name);
  const permitPdf = permit.project_name
    ? await downloadPermitPdfBase64(
        permitId,
        permit.project_name,
        permit.facility_id,
      )
    : null;

  return issuedClientContextResponseSchema.parse({
    attachments: permitPdf ? [permitPdf] : [],
    bodyHtml: template.bodyHtml,
    kind: "dust-permit-issued-client",
    mailbox: FROM_MAILBOX,
    permitId,
    route:
      route.mode === "reply-all" && route.replyToEmailId
        ? {
            mode: "reply-all",
            replyToMessageId: await resolveChiMessageId(route.replyToEmailId),
            subject: template.subject,
          }
        : {
            mode: "compose-new",
            subject: template.subject,
            to: [{ email: FROM_MAILBOX }],
          },
    send: !input.draft,
    type,
  });
}

function invalidRequestResponse(error: z.ZodError): Response {
  return Response.json(
    {
      error: "Invalid request",
      details: z.flattenError(error),
    },
    { status: 400 },
  );
}

function errorResponse(error: unknown): Response {
  if (error instanceof RequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error("[api.communications.issued-client] failed", {
    error: message,
  });
  return Response.json(
    {
      details: message,
      error: "Failed to build issued client draft context",
    },
    { status: 500 },
  );
}

export async function postIssuedClientContext(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedInput = issuedClientContextRequestSchema.safeParse(json);
  if (!parsedInput.success) {
    return invalidRequestResponse(parsedInput.error);
  }

  try {
    const response = await buildIssuedClientContext(parsedInput.data);
    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
