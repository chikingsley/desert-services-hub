import { db } from "@lib/db/client";
import { z } from "zod";

const FROM_MAILBOX = "chi@desertservices.net";
const BILLING_TO = ["eva@desertservices.net", "danielr@desertservices.net"] as const;
const BILLING_CC = [
  "don@desertservices.net",
  "francine@desertservices.net",
  "dawn@desertservices.net",
] as const;

const CARDHOLDER = "Chibuzor Ejimofor";
const CARD_LAST_FOUR = "8113";
const PAYMENT_METHOD = "Credit Card";
const VENDOR = "Maricopa County ADEQ";
const ELEVEN_MONTHS_MS = 11 * 30 * 24 * 60 * 60 * 1000;

const FEE_TO_SCHEDULE: Record<number, number> = {
  570: 1070,
  1130: 1630,
  4120: 4870,
  6870: 7870,
  10310: 11_560,
  16490: 18_490,
};

const submittedBillingContextRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("payment-email"),
    emailId: z.number().int().positive(),
    draft: z.boolean().default(true),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
  z.object({
    mode: z.literal("manual"),
    permitId: z.string().regex(/^D\d{7}$/),
    draft: z.boolean().default(true),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
  z.object({
    mode: z.literal("invoice"),
    invoiceNumber: z.string().regex(/^IV\d+$/),
    draft: z.boolean().default(true),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
]);

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).optional(),
});

const submittedBillingContextResponseSchema = z.object({
  kind: z.literal("dust-permit-submitted-billing"),
  mailbox: z.string().email(),
  to: z.array(recipientSchema).min(1),
  cc: z.array(recipientSchema),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  send: z.boolean(),
  permitId: z.string().regex(/^D\d{7}$/),
  invoiceNumber: z.string().regex(/^IV\d+$/).nullable(),
  paymentDate: z.string().nullable(),
  scheduleCharge: z.string().min(1),
  classification: z.enum(["new", "revision", "renewal"]),
});

type SubmittedBillingContextRequest = z.infer<
  typeof submittedBillingContextRequestSchema
>;
export type SubmittedBillingContext = z.infer<
  typeof submittedBillingContextResponseSchema
>;

type PermitClassification = "new" | "revision" | "renewal";

interface BillingPermitRow {
  address: string | null;
  company_name: string | null;
  facility_id: string | null;
  id: string;
  invoice_charges: number | null;
  invoice_number: string | null;
  is_accelerated: number;
  previous_app_id: string | null;
  project_name: string | null;
  submitted_date: string | null;
}

interface EmailBodyRow {
  body_full: string | null;
  body_preview: string | null;
}

class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapHtml(content: string): string {
  return `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>${content}</body></html>`;
}

function signatureHtml(): string {
  return `<div><br></div>
<div>Best,</div>
<div>---</div>
<div><br></div>
<div><b>${escapeHtml("Chi Ejimofor")}</b></div>
<div>Project Coordinator</div>
<div>Desert Services LLC</div>
<div>E: <a href="mailto:chi@desertservices.net">chi@desertservices.net</a></div>
<div>O: (480) 513-8986</div>`;
}

function li(label: string, value: string | null): string {
  return value
    ? `<li><div><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div></li>`
    : "";
}

function extractInvoiceNumber(body: string): string | null {
  return body.match(/Account Number:\s*(IV\d+)/i)?.[1] ?? null;
}

function extractPaymentDate(body: string): string | null {
  return body.match(/Payment Date:\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
}

function scheduleCharge(fee: number): string | null {
  const direct = FEE_TO_SCHEDULE[fee];
  if (direct !== undefined) {
    return `$${direct.toLocaleString("en-US")}`;
  }

  for (const [baseFeeText, schedule] of Object.entries(FEE_TO_SCHEDULE)) {
    const baseFee = Number.parseInt(baseFeeText, 10);
    if (fee === baseFee * 2) {
      return `$${(fee + schedule - baseFee).toLocaleString("en-US")}`;
    }
  }

  return null;
}

function requestError(status: number, message: string): never {
  throw new RequestError(status, message);
}

async function resolvePermitId(
  input: SubmittedBillingContextRequest,
): Promise<{ permitId: string; paymentDate: string | null }> {
  if (input.mode === "payment-email") {
    const email = await db
      .query<EmailBodyRow, [number]>(
        "SELECT body_full, body_preview FROM emails WHERE id = $1",
      )
      .get(input.emailId);

    if (!email) {
      requestError(404, `Email ${input.emailId} not found`);
    }

    const body = email.body_full ?? email.body_preview;
    if (!body) {
      requestError(422, `Email ${input.emailId} has no body content`);
    }

    const invoiceNumber = extractInvoiceNumber(body);
    if (!invoiceNumber) {
      requestError(422, `Email ${input.emailId} has no IV number`);
    }

    const match = await db
      .query<{ id: string }, [string]>(
        "SELECT id FROM dust_permits_filed_by_desert_services WHERE invoice_number = $1 LIMIT 1",
      )
      .get(invoiceNumber);

    if (!match) {
      requestError(404, `No permit found for invoice ${invoiceNumber}`);
    }

    return {
      permitId: match.id,
      paymentDate: extractPaymentDate(body),
    };
  }

  if (input.mode === "invoice") {
    const match = await db
      .query<{ id: string; submitted_date: string | null }, [string]>(
        "SELECT id, submitted_date FROM dust_permits_filed_by_desert_services WHERE invoice_number = $1 LIMIT 1",
      )
      .get(input.invoiceNumber);

    if (!match) {
      requestError(404, `No permit found for invoice ${input.invoiceNumber}`);
    }

    return {
      permitId: match.id,
      paymentDate: match.submitted_date,
    };
  }

  const permit = await db
    .query<{ submitted_date: string | null }, [string]>(
      "SELECT submitted_date FROM dust_permits_filed_by_desert_services WHERE id = $1",
    )
    .get(input.permitId);

  return {
    permitId: input.permitId,
    paymentDate: permit?.submitted_date ?? null,
  };
}

async function classifyPermit(
  submittedDate: string | null,
  previousAppId: string | null,
): Promise<PermitClassification> {
  if (!previousAppId || !submittedDate) {
    return "new";
  }

  let originDate = submittedDate;
  let currentPreviousAppId: string | null = previousAppId;

  while (currentPreviousAppId) {
    const previousPermit = await db
      .query<{ submitted_date: string | null; previous_app_id: string | null }, [
        string,
      ]>(
        "SELECT submitted_date, previous_app_id FROM dust_permits_filed_by_desert_services WHERE id = $1",
      )
      .get(currentPreviousAppId);

    if (!previousPermit) {
      break;
    }

    if (previousPermit.submitted_date) {
      originDate = previousPermit.submitted_date;
    }

    currentPreviousAppId = previousPermit.previous_app_id;
  }

  const submittedTime = Date.parse(submittedDate);
  const originTime = Date.parse(originDate);
  if (!Number.isFinite(submittedTime) || !Number.isFinite(originTime)) {
    return "renewal";
  }

  return submittedTime - originTime < ELEVEN_MONTHS_MS
    ? "revision"
    : "renewal";
}

function renderBillingEmail(
  permit: BillingPermitRow,
  schedule: string,
  paymentDate: string | null,
  classification: PermitClassification,
): { bodyHtml: string; subject: string } {
  const prefixByClassification: Record<PermitClassification, string> = {
    new: "Dust Permit Billing",
    revision: "Dust Permit Billing (Revision)",
    renewal: "Dust Permit Billing (Renewal)",
  };

  const introByClassification: Record<PermitClassification, string> = {
    new: "A dust permit application has been submitted to Maricopa County. Please prepare for billing.",
    revision:
      "A dust permit revision has been submitted to Maricopa County. Please prepare for billing.",
    renewal:
      "A dust permit renewal has been submitted to Maricopa County. Please prepare for billing.",
  };

  if (permit.invoice_charges === null) {
    requestError(422, `Permit ${permit.id} has no invoice_charges`);
  }

  if (!permit.project_name) {
    requestError(422, `Permit ${permit.id} has no project_name`);
  }

  const cost = `$${permit.invoice_charges.toLocaleString("en-US")}`;
  const showSuperseded = classification !== "new";
  const separator = "<li><div>----</div></li>";

  const bodyHtml = wrapHtml(
    `<div>Team,</div><div><br></div>` +
      `<div>${escapeHtml(introByClassification[classification])}</div>` +
      `<div><br></div>` +
      `<ul style="margin-top:0; margin-bottom:0;">` +
      li("Customer", permit.company_name) +
      li("Project", permit.project_name) +
      li("Site Address", permit.address) +
      li("Application #", permit.id) +
      (showSuperseded
        ? li("Superseded Application #", permit.previous_app_id)
        : "") +
      li("Permit # (Facility ID)", permit.facility_id) +
      li("Accelerated Processing", permit.is_accelerated ? "Yes" : "No") +
      separator +
      li("Vendor Paid", VENDOR) +
      li("Permit Cost", cost) +
      li("Schedule Charge", schedule) +
      li("Invoice #", permit.invoice_number) +
      separator +
      li("Payment Method", PAYMENT_METHOD) +
      li("Payment Date", paymentDate) +
      li("Cardholder", CARDHOLDER) +
      li("Card Last 4", CARD_LAST_FOUR) +
      `</ul>` +
      `<div><br></div><div>Let me know if you have any questions!</div>` +
      signatureHtml(),
  );

  return {
    bodyHtml,
    subject: `${prefixByClassification[classification]} - ${permit.project_name}`,
  };
}

async function buildSubmittedBillingContext(
  input: SubmittedBillingContextRequest,
): Promise<SubmittedBillingContext> {
  const { permitId, paymentDate } = await resolvePermitId(input);

  const permit = await db
    .query<BillingPermitRow, [string]>(
      `SELECT id, project_name, company_name, address, facility_id,
              invoice_number, invoice_charges, is_accelerated, previous_app_id, submitted_date
       FROM dust_permits_filed_by_desert_services
       WHERE id = $1`,
    )
    .get(permitId);

  if (!permit) {
    requestError(404, `Permit ${permitId} not found`);
  }

  const classification = await classifyPermit(
    permit.submitted_date,
    permit.previous_app_id,
  );

  if (permit.invoice_charges === null) {
    requestError(
      422,
      `Permit ${permitId} has no invoice_charges - run a permit sync`,
    );
  }

  const resolvedSchedule =
    input.scheduleValue ?? scheduleCharge(permit.invoice_charges);
  if (!resolvedSchedule) {
    requestError(
      422,
      `No schedule charge mapped for fee $${permit.invoice_charges} - provide scheduleValue manually`,
    );
  }

  const { bodyHtml, subject } = renderBillingEmail(
    permit,
    resolvedSchedule,
    paymentDate,
    classification,
  );

  const response = submittedBillingContextResponseSchema.parse({
    kind: "dust-permit-submitted-billing",
    mailbox: FROM_MAILBOX,
    to: BILLING_TO.map((email) => ({ email })),
    cc: BILLING_CC.map((email) => ({ email })),
    subject,
    bodyHtml,
    send: !input.draft,
    permitId,
    invoiceNumber: permit.invoice_number,
    paymentDate,
    scheduleCharge: resolvedSchedule,
    classification,
  });

  return response;
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
  console.error("[api.communications.submitted-billing] failed", {
    error: message,
  });
  return Response.json(
    {
      error: "Failed to build submitted billing draft context",
      details: message,
    },
    { status: 500 },
  );
}

/**
 * POST /api/internal/communications/dust-permit/submitted-billing-context
 */
export async function postSubmittedBillingContext(
  req: Request,
): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedInput = submittedBillingContextRequestSchema.safeParse(json);
  if (!parsedInput.success) {
    return invalidRequestResponse(parsedInput.error);
  }

  try {
    const response = await buildSubmittedBillingContext(parsedInput.data);
    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
