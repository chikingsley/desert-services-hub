/**
 * Monday.com API fetchers for account and contact snapshots.
 * Extracted from sync-relations.ts to stay under the 500-line limit.
 */
import { query } from "@monday/client";
import { CONTACTS_COLUMNS, CONTRACTORS_COLUMNS } from "@monday/types";
import { chunk } from "./sql-utils";
import {
  type MondayAccountSnapshot,
  type MondayContactSnapshot,
  normalizeDomain,
  sanitizeMondayId,
  uniqueNumericIds,
} from "./sync-relations";

const ACCOUNT_BATCH_SIZE = 100;
const CONTACT_BATCH_SIZE = 50;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function extractEmail(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const match = raw.match(EMAIL_REGEX);
  return match?.[0]?.toLowerCase() ?? null;
}

function getColumnText(
  columns: Array<{ id: string; text: string | null }>,
  columnId: string
): string | null {
  return columns.find((col) => col.id === columnId)?.text ?? null;
}

function getColumnRelationHead(
  columns: Array<{ id: string; linked_item_ids?: string[] }>,
  columnId: string
): string | null {
  const linked = columns.find((col) => col.id === columnId)?.linked_item_ids;
  return sanitizeMondayId(linked?.[0]);
}

export async function fetchAccountSnapshots(
  accountIds: string[]
): Promise<Map<string, MondayAccountSnapshot>> {
  const snapshots = new Map<string, MondayAccountSnapshot>();
  const uniqueIds = uniqueNumericIds(accountIds);
  if (uniqueIds.length === 0) {
    return snapshots;
  }

  for (const batch of chunk(uniqueIds, ACCOUNT_BATCH_SIZE)) {
    const result = await query<{
      items: Array<{
        id: string;
        name: string;
        column_values: Array<{ id: string; text: string | null }>;
      }>;
    }>(`
      query {
        items(ids: [${batch.join(",")}]) {
          id
          name
          column_values(ids: ["${CONTRACTORS_COLUMNS.DOMAIN.id}"]) {
            id
            text
          }
        }
      }
    `);

    for (const item of result.items) {
      snapshots.set(item.id, {
        mondayItemId: item.id,
        name: item.name.trim() || item.name,
        domain: normalizeDomain(
          getColumnText(item.column_values, CONTRACTORS_COLUMNS.DOMAIN.id)
        ),
      });
    }
  }

  return snapshots;
}

export async function fetchContactSnapshots(
  contactIds: string[]
): Promise<Map<string, MondayContactSnapshot>> {
  const snapshots = new Map<string, MondayContactSnapshot>();
  const uniqueIds = uniqueNumericIds(contactIds);
  if (uniqueIds.length === 0) {
    return snapshots;
  }

  const contactColumnIds = [
    CONTACTS_COLUMNS.EMAIL.id,
    CONTACTS_COLUMNS.PHONE.id,
    CONTACTS_COLUMNS.MOBILE_PHONE.id,
    CONTACTS_COLUMNS.OFFICE_PHONE.id,
    CONTACTS_COLUMNS.COMPANY_PHONE.id,
    CONTACTS_COLUMNS.COMPANY_FAX.id,
    CONTACTS_COLUMNS.TITLE.id,
    CONTACTS_COLUMNS.PRIORITY.id,
    CONTACTS_COLUMNS.CONTRACTOR.id,
  ];
  const columnLiteral = contactColumnIds.map((id) => `"${id}"`).join(", ");

  for (const batch of chunk(uniqueIds, CONTACT_BATCH_SIZE)) {
    const result = await query<{
      items: Array<{
        id: string;
        name: string;
        group: { id: string; title: string };
        column_values: Array<{
          id: string;
          text: string | null;
          linked_item_ids?: string[];
        }>;
      }>;
    }>(`
      query {
        items(ids: [${batch.join(",")}]) {
          id
          name
          group {
            id
            title
          }
          column_values(ids: [${columnLiteral}]) {
            id
            text
            ... on BoardRelationValue {
              linked_item_ids
            }
          }
        }
      }
    `);

    for (const item of result.items) {
      snapshots.set(item.id, {
        mondayItemId: item.id,
        name: item.name.trim() || item.name,
        email: extractEmail(
          getColumnText(item.column_values, CONTACTS_COLUMNS.EMAIL.id)
        ),
        phone: getColumnText(item.column_values, CONTACTS_COLUMNS.PHONE.id),
        mobilePhone: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.MOBILE_PHONE.id
        ),
        officePhone: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.OFFICE_PHONE.id
        ),
        companyPhone: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.COMPANY_PHONE.id
        ),
        companyFax: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.COMPANY_FAX.id
        ),
        title: getColumnText(item.column_values, CONTACTS_COLUMNS.TITLE.id),
        priority: getColumnText(
          item.column_values,
          CONTACTS_COLUMNS.PRIORITY.id
        ),
        contractorMondayId: getColumnRelationHead(
          item.column_values,
          CONTACTS_COLUMNS.CONTRACTOR.id
        ),
        groupId: item.group?.id ?? "",
        groupTitle: item.group?.title ?? "",
      });
    }
  }

  return snapshots;
}
