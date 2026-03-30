import { getEmailById } from "@email/db/email";
import { db } from "@lib/db/client";
import { z } from "zod";
import {
  FROM_MAILBOX,
  classifyPermit,
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

const submittedClientContextRequestSchema = z.discriminatedUnion("mode", [
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

const submittedClientContextResponseSchema = z.object({
  bodyHtml: z.string().min(1),
  kind: z.literal("dust-permit-submitted-client"),
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
});

type SubmittedClientContextRequest = z.infer<
  typeof submittedClientContextRequestSchema
>;

type SubmittedClientContext = z.infer<
  typeof submittedClientContextResponseSchema
>;

interface SubmittedPermitRow {
  address: string | null;
  company_name: string | null;
  facility_id: string | null;
  id: string;
  previous_app_id: string | null;
  project_id: number | null;
  project_name: string | null;
  submitted_date: string | null;
}

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

function renderSubmittedEmail(
  permit: SubmittedPermitRow,
  classification: "new" | "revision" | "renewal",
): string {
  if (!permit.project_name) {
    requestError(422, `Permit ${permit.id} has no project_name`);
  }

  if (!permit.company_name) {
    requestError(422, `Permit ${permit.id} has no company_name`);
  }

  const typeWord = {
    new: "application",
    renewal: "renewal",
    revision: "revision",
  }[classification];
  const facilityLine = permit.facility_id
    ? `${escapeHtml(permit.facility_id)}${
        classification !== "new"
          ? ` (${classification.charAt(0).toUpperCase() + classification.slice(1)})`
          : ""
      }`
    : '<span style="color:red">Pending</span>';

  return wrapHtml(
    `<div>Team,</div>` +
      `<div><br></div>` +
      `<div>A dust permit ${typeWord} for <b>${escapeHtml(
        permit.company_name,
      )}</b> on project "<b>${escapeHtml(
        permit.project_name,
      )}</b>" has been submitted to Maricopa County (see attached).</div>` +
      `<div><br></div>` +
      `<div>Here are the key details:</div>` +
      `<ul style="margin-top:0; margin-bottom:0;">` +
      `<li><div>Permit Status: Submitted</div></li>` +
      `<li><div>Application #: ${escapeHtml(permit.id)}</div></li>` +
      `<li><div>Permit # (Facility ID): ${facilityLine}</div></li>` +
      `<li><div>Project Name: ${escapeHtml(permit.project_name)}</div></li>` +
      (permit.address
        ? `<li><div>Site Address: ${escapeHtml(permit.address)}</div></li>`
        : "") +
      `</ul>` +
      `<div><br></div>` +
      `<div>Processing typically takes 5-10 business days. If you need expedited processing, please reach out immediately.</div>` +
      `<div><br></div>` +
      `<div>Let me know if you have any questions!</div>` +
      signatureHtml(),
  );
}

async function buildSubmittedClientContext(
  input: SubmittedClientContextRequest,
): Promise<SubmittedClientContext> {
  const { permitId } = await resolvePermitId(db, input);

  const permit = await db
    .query<SubmittedPermitRow, [string]>(
      `SELECT id, project_name, company_name, address, facility_id,
              previous_app_id, project_id, submitted_date
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
  const candidates = await findReplyCandidates(
    db,
    permitId,
    permit.project_name,
    permit.project_id,
  );
  const route = selectReplyRoute(candidates, permitId, permit.project_name);

  const context = submittedClientContextResponseSchema.parse({
    bodyHtml: renderSubmittedEmail(permit, classification),
    kind: "dust-permit-submitted-client",
    mailbox: FROM_MAILBOX,
    permitId,
    route:
      route.mode === "reply-all" && route.replyToEmailId
        ? {
            mode: "reply-all",
            replyToMessageId: await resolveChiMessageId(route.replyToEmailId),
            subject: `Dust Permit Submitted — ${permit.project_name} (${permitId})`,
          }
        : {
            mode: "compose-new",
            subject: `Dust Permit Submitted — ${permit.project_name} (${permitId})`,
            to: [{ email: FROM_MAILBOX }],
          },
    send: !input.draft,
  });

  return context;
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
  console.error("[api.communications.submitted-client] failed", {
    error: message,
  });
  return Response.json(
    {
      details: message,
      error: "Failed to build submitted client draft context",
    },
    { status: 500 },
  );
}

export async function postSubmittedClientContext(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedInput = submittedClientContextRequestSchema.safeParse(json);
  if (!parsedInput.success) {
    return invalidRequestResponse(parsedInput.error);
  }

  try {
    const response = await buildSubmittedClientContext(parsedInput.data);
    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
