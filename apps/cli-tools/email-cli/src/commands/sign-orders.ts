/**
 * Sign order commands.
 *
 * - sign-order-draft: build Sandstorm draft + tracker row
 * - sign-orders: list tracked sign orders
 * - sign-order-update: update lifecycle status
 */

import { parseArgs } from "node:util";
import { getWriteClient, resolveWritableMailbox } from "@email/commands/config";
import type { CommandHandler } from "@email/commands/types";
import { getLogoAttachment, getTemplate } from "@email/email-templates/index";
import {
  buildSignOrderDetails,
  buildSignOrderSubject,
  isSignOrderType,
  SIGN_ORDER_TYPES,
} from "@email/sign-orders";
import { getPermitById } from "@lib/db/repositories/dust-permit";
import {
  createSignOrder,
  listSignOrders,
  SIGN_ORDER_STATUSES,
  type SignOrderStatus,
  updateSignOrderStatus,
} from "@lib/db/repositories/sign-order";

const DEFAULT_VENDOR_EMAIL = "kelli@sandstormsign.com";

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(value: string | undefined, label: string): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalInt(
  value: string | undefined,
  label: string
): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseStatus(value: string | undefined): SignOrderStatus {
  const status = optionalString(value);
  if (!status) {
    throw new Error(
      `status required. Allowed values: ${SIGN_ORDER_STATUSES.join(", ")}`
    );
  }

  if (!(SIGN_ORDER_STATUSES as readonly string[]).includes(status)) {
    throw new Error(
      `invalid status "${status}". Allowed values: ${SIGN_ORDER_STATUSES.join(", ")}`
    );
  }

  return status as SignOrderStatus;
}

async function signOrderDraftCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      user: { type: "string", short: "u" },
      to: { type: "string" },
      project: { type: "string" },
      "project-id": { type: "string" },
      "sign-type": { type: "string" },
      quantity: { type: "string", short: "q", default: "1" },
      "permit-id": { type: "string" },
      "noi-azc": { type: "string" },
      "facility-id": { type: "string" },
      company: { type: "string" },
      address: { type: "string" },
      "contact-name": { type: "string" },
      "contact-phone": { type: "string" },
      message: { type: "string", short: "m" },
      "custom-block": { type: "string" },
    },
  });

  const mailbox = resolveWritableMailbox(
    optionalString(values.user),
    "sign-order-draft"
  );

  const signTypeRaw = optionalString(values["sign-type"]);
  if (!(signTypeRaw && isSignOrderType(signTypeRaw))) {
    throw new Error(
      `--sign-type is required. Allowed values: ${SIGN_ORDER_TYPES.join(", ")}`
    );
  }

  const permitId = optionalString(values["permit-id"]);
  const permit = permitId ? await getPermitById(permitId) : null;

  const projectName =
    optionalString(values.project) ?? optionalString(permit?.projectName);
  if (!projectName) {
    throw new Error(
      "Project name is required (--project or --permit-id with project_name)"
    );
  }

  const quantity = parsePositiveInt(
    optionalString(values.quantity),
    "quantity"
  );
  const to = optionalString(values.to) ?? DEFAULT_VENDOR_EMAIL;

  const subject = buildSignOrderSubject({
    signType: signTypeRaw,
    projectName,
  });

  const signDetails = buildSignOrderDetails({
    signType: signTypeRaw,
    projectName,
    quantity,
    companyName:
      optionalString(values.company) ?? optionalString(permit?.companyName),
    address: optionalString(values.address) ?? optionalString(permit?.address),
    permitId: permitId ?? optionalString(permit?.id),
    noiAzc: optionalString(values["noi-azc"]),
    facilityId:
      optionalString(values["facility-id"]) ??
      optionalString(permit?.facilityId),
    contactName: optionalString(values["contact-name"]),
    contactPhone: optionalString(values["contact-phone"]),
    customBlock: optionalString(values["custom-block"]),
  });

  const html = await getTemplate("sandstorm-sign-order", {
    signDetails,
    additionalMessage: optionalString(values.message) ?? "",
    showDoubleExclamation: "",
  });

  const logo = await getLogoAttachment();
  const client = await getWriteClient(mailbox);

  const draft = await client.createDraft({
    userId: mailbox,
    to: [{ email: to }],
    subject,
    body: html,
    bodyType: "html",
    attachments: [logo],
    skipSignature: true,
  });

  const signOrderId = await createSignOrder({
    projectId: parseOptionalInt(
      optionalString(values["project-id"]),
      "project-id"
    ),
    projectName,
    signType: signTypeRaw,
    quantity,
    permitId: permitId ?? optionalString(permit?.id) ?? null,
    noiAzc: optionalString(values["noi-azc"]) ?? null,
    vendorEmail: to,
    requestedByEmail: mailbox,
    mailboxEmail: mailbox,
    subject,
    signDetails,
    draftId: draft.id,
    status: "drafted",
    metadata: {
      companyName:
        optionalString(values.company) ??
        optionalString(permit?.companyName) ??
        null,
      address:
        optionalString(values.address) ??
        optionalString(permit?.address) ??
        null,
      facilityId:
        optionalString(values["facility-id"]) ??
        optionalString(permit?.facilityId) ??
        null,
      contactName: optionalString(values["contact-name"]) ?? null,
      contactPhone: optionalString(values["contact-phone"]) ?? null,
      customBlock: optionalString(values["custom-block"]) ?? null,
      additionalMessage: optionalString(values.message) ?? null,
    },
  });

  console.log(`Done - Sign-order draft created (tracker #${signOrderId})`);
  console.log(`  Draft ID: ${draft.id}`);
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);
}

async function signOrdersCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: "string" },
      "project-id": { type: "string" },
      status: { type: "string" },
      limit: { type: "string", default: "25" },
    },
  });

  const limit = parsePositiveInt(optionalString(values.limit), "limit");
  const statusRaw = optionalString(values.status);
  const status = statusRaw ? parseStatus(statusRaw) : undefined;

  const rows = await listSignOrders({
    projectId: parseOptionalInt(
      optionalString(values["project-id"]),
      "project-id"
    ),
    projectName: optionalString(values.project),
    status,
    limit,
  });

  if (rows.length === 0) {
    console.log("No sign orders found.");
    return;
  }

  console.log(`Found ${rows.length} sign order(s):`);
  for (const row of rows) {
    console.log(
      `  #${row.id} [${row.status}] ${row.projectName} | ${row.signType} x${row.quantity}`
    );
    console.log(
      `     draft=${row.draftId ?? "-"} permit=${row.permitId ?? "-"} noi=${row.noiAzc ?? "-"} created=${row.createdAt}`
    );
  }
}

async function signOrderUpdateCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      status: { type: "string" },
      "draft-id": { type: "string" },
      "message-id": { type: "string" },
    },
    allowPositionals: true,
  });

  const idRaw = positionals[0];
  const id = Number.parseInt(idRaw ?? "", 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(
      "Usage: sign-order-update <id> --status <drafted|sent|fulfilled|cancelled>"
    );
  }

  const status = parseStatus(optionalString(values.status));

  await updateSignOrderStatus({
    id,
    status,
    draftId: optionalString(values["draft-id"]),
    messageId: optionalString(values["message-id"]),
  });

  console.log(`Updated sign order #${id} -> ${status}`);
}

export const signOrderHandlers: Record<string, CommandHandler> = {
  "sign-order-draft": signOrderDraftCommand,
  "sign-orders": signOrdersCommand,
  "sign-order-update": signOrderUpdateCommand,
};
