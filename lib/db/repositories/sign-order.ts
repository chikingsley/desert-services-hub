/**
 * Sign Order Repository
 *
 * Tracks Sandstorm sign-order drafts and lifecycle status per project.
 */

import { db } from "@lib/db/client";

export const SIGN_ORDER_STATUSES = [
  "drafted",
  "sent",
  "fulfilled",
  "cancelled",
] as const;

export type SignOrderStatus = (typeof SIGN_ORDER_STATUSES)[number];

export const SIGN_ORDER_TYPES = [
  "swppp-sign",
  "swppp-sticker",
  "dust-maricopa",
  "dust-pinal",
  "fire-access",
  "fire-lane",
  "custom",
] as const;

export type SignOrderType = (typeof SIGN_ORDER_TYPES)[number];

export interface SignOrderRecord {
  id: number;
  projectId: number | null;
  projectName: string;
  signType: SignOrderType;
  quantity: number;
  permitId: string | null;
  noiAzc: string | null;
  vendorEmail: string;
  requestedByEmail: string;
  mailboxEmail: string;
  subject: string;
  signDetails: string;
  draftId: string | null;
  messageId: string | null;
  status: SignOrderStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSignOrderInput {
  projectId?: number | null;
  projectName: string;
  signType: SignOrderType;
  quantity: number;
  permitId?: string | null;
  noiAzc?: string | null;
  vendorEmail: string;
  requestedByEmail: string;
  mailboxEmail: string;
  subject: string;
  signDetails: string;
  draftId?: string | null;
  messageId?: string | null;
  status?: SignOrderStatus;
  metadata?: Record<string, unknown>;
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function parseRow(row: Record<string, unknown>): SignOrderRecord {
  return {
    id: Number(row.id),
    projectId: (row.project_id as number | null) ?? null,
    projectName: String(row.project_name),
    signType: row.sign_type as SignOrderType,
    quantity: Number(row.quantity),
    permitId: (row.permit_id as string | null) ?? null,
    noiAzc: (row.noi_azc as string | null) ?? null,
    vendorEmail: String(row.vendor_email),
    requestedByEmail: String(row.requested_by_email),
    mailboxEmail: String(row.mailbox_email),
    subject: String(row.subject),
    signDetails: String(row.sign_details),
    draftId: (row.draft_id as string | null) ?? null,
    messageId: (row.message_id as string | null) ?? null,
    status: row.status as SignOrderStatus,
    metadata: parseMetadata(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createSignOrder(
  input: CreateSignOrderInput
): Promise<number> {
  const status = input.status ?? "drafted";
  const metadataJson = JSON.stringify(input.metadata ?? {});

  const rows = (await db.run(
    `INSERT INTO sign_orders (
      project_id,
      project_name,
      sign_type,
      quantity,
      permit_id,
      noi_azc,
      vendor_email,
      requested_by_email,
      mailbox_email,
      subject,
      sign_details,
      draft_id,
      message_id,
      status,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
    RETURNING id`,
    [
      input.projectId ?? null,
      input.projectName,
      input.signType,
      input.quantity,
      input.permitId ?? null,
      input.noiAzc ?? null,
      input.vendorEmail,
      input.requestedByEmail,
      input.mailboxEmail,
      input.subject,
      input.signDetails,
      input.draftId ?? null,
      input.messageId ?? null,
      status,
      metadataJson,
    ]
  )) as Array<{ id: number }>;

  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create sign order record");
  }

  return id;
}

export async function updateSignOrderStatus(options: {
  id: number;
  status: SignOrderStatus;
  draftId?: string | null;
  messageId?: string | null;
}): Promise<void> {
  await db.run(
    `UPDATE sign_orders
     SET
      status = $1,
      draft_id = COALESCE($2, draft_id),
      message_id = COALESCE($3, message_id),
      updated_at = now()
     WHERE id = $4`,
    [
      options.status,
      options.draftId ?? null,
      options.messageId ?? null,
      options.id,
    ]
  );
}

export async function listSignOrders(options?: {
  projectId?: number;
  projectName?: string;
  status?: SignOrderStatus;
  limit?: number;
}): Promise<SignOrderRecord[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (typeof options?.projectId === "number") {
    conditions.push(`project_id = $${paramIndex++}`);
    params.push(options.projectId);
  }

  if (options?.projectName) {
    conditions.push(`project_name ILIKE $${paramIndex++}`);
    params.push(`%${options.projectName}%`);
  }

  if (options?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(options.status);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options?.limit ?? 25;

  const rows = await db
    .query<Record<string, unknown>, unknown[]>(
      `SELECT
        id,
        project_id,
        project_name,
        sign_type,
        quantity,
        permit_id,
        noi_azc,
        vendor_email,
        requested_by_email,
        mailbox_email,
        subject,
        sign_details,
        draft_id,
        message_id,
        status,
        metadata,
        created_at,
        updated_at
      FROM sign_orders
      ${where}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}`
    )
    .all(...params, Math.max(1, Math.min(500, limit)));

  return rows.map(parseRow);
}
