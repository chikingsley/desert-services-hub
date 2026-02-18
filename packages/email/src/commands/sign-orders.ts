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
} from "@email/sign-orders";
import { getPermitById } from "@lib/db/repositories/dust-permit";
import type { SignOrderStatus } from "@lib/db/repositories/sign-order";
import {
  createSignOrder,
  listSignOrders,
  SIGN_ORDER_STATUSES,
  SIGN_ORDER_TYPES,
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
      address: { type: "string" },
      company: { type: "string" },
      "contact-name": { type: "string" },
      "contact-phone": { type: "string" },
      "custom-block": { type: "string" },
      "facility-id": { type: "string" },
      message: { type: "string", short: "m" },
      "noi-azc": { type: "string" },
      "permit-id": { type: "string" },
      project: { type: "string" },
      "project-id": { type: "string" },
      quantity: { type: "string", short: "q", default: "1" },
      "sign-type": { type: "string" },
      to: { type: "string" },
      user: { type: "string", short: "u" },
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
    projectName,
    signType: signTypeRaw,
  });

  const signDetails = buildSignOrderDetails({
    address: optionalString(values.address) ?? optionalString(permit?.address),
    companyName:
      optionalString(values.company) ?? optionalString(permit?.companyName),
    contactName: optionalString(values["contact-name"]),
    contactPhone: optionalString(values["contact-phone"]),
    customBlock: optionalString(values["custom-block"]),
    facilityId:
      optionalString(values["facility-id"]) ??
      optionalString(permit?.facilityId),
    noiAzc: optionalString(values["noi-azc"]),
    permitId: permitId ?? optionalString(permit?.id),
    projectName,
    quantity,
    signType: signTypeRaw,
  });

  const html = await getTemplate("sandstorm-sign-order", {
    additionalMessage: optionalString(values.message) ?? "",
    showDoubleExclamation: "",
    signDetails,
  });

  const logo = await getLogoAttachment();
  const client = await getWriteClient(mailbox);

  const draft = await client.createDraft({
    attachments: [logo],
    body: html,
    bodyType: "html",
    skipSignature: true,
    subject,
    to: [{ email: to }],
    userId: mailbox,
  });

  const signOrderId = await createSignOrder({
    draftId: draft.id,
    mailboxEmail: mailbox,
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
    noiAzc: optionalString(values["noi-azc"]) ?? null,
    permitId: permitId ?? optionalString(permit?.id) ?? null,
    projectId: parseOptionalInt(
      optionalString(values["project-id"]),
      "project-id"
    ),
    projectName,
    quantity,
    requestedByEmail: mailbox,
    signDetails,
    signType: signTypeRaw,
    status: "drafted",
    subject,
    vendorEmail: to,
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
      limit: { type: "string", default: "25" },
      project: { type: "string" },
      "project-id": { type: "string" },
      status: { type: "string" },
    },
  });

  const limit = parsePositiveInt(optionalString(values.limit), "limit");
  const statusRaw = optionalString(values.status);
  const status = statusRaw ? parseStatus(statusRaw) : undefined;

  const rows = await listSignOrders({
    limit,
    projectId: parseOptionalInt(
      optionalString(values["project-id"]),
      "project-id"
    ),
    projectName: optionalString(values.project),
    status,
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
    allowPositionals: true,
    args,
    options: {
      status: { type: "string" },
      "draft-id": { type: "string" },
      "message-id": { type: "string" },
    },
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
    draftId: optionalString(values["draft-id"]),
    id,
    messageId: optionalString(values["message-id"]),
    status,
  });

  console.log(`Updated sign order #${id} -> ${status}`);
}

export const signOrderHandlers: Record<string, CommandHandler> = {
  "sign-order-draft": signOrderDraftCommand,
  "sign-order-update": signOrderUpdateCommand,
  "sign-orders": signOrdersCommand,
};
