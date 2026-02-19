import { db } from "../../../../lib/db/client";
import type { DustApplicationDetail } from "../aqdata/parsers/dust-application-detail";
import type { DustApplicationDetailQAResult } from "../aqdata/parsers/dust-application-detail-qa";
import type { AQPermitRecord } from "./types";

export interface AQPermitListRow {
  id: string;
  status: string | null;
}

export async function upsertAQDataPermits(
  records: readonly AQPermitRecord[]
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  await db.transaction(async () => {
    for (const record of records) {
      await db.run(
        `INSERT INTO aqdata_permits (
          id, facility_id, facility_name, project_name, company_id, company_name,
          status, submitted_date, effective_date, expiration_date, closed_date,
          previous_app_id, project_start_date, project_completion_date,
          address, city, parcel, is_block_permit, is_accelerated,
          invoice_number, invoice_charges, invoice_balance, raw_export, exported_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23::jsonb, now()
        )
        ON CONFLICT(id) DO UPDATE SET
          facility_id = excluded.facility_id,
          facility_name = excluded.facility_name,
          project_name = excluded.project_name,
          company_id = excluded.company_id,
          company_name = excluded.company_name,
          status = excluded.status,
          submitted_date = excluded.submitted_date,
          effective_date = excluded.effective_date,
          expiration_date = excluded.expiration_date,
          closed_date = excluded.closed_date,
          previous_app_id = excluded.previous_app_id,
          project_start_date = excluded.project_start_date,
          project_completion_date = excluded.project_completion_date,
          address = excluded.address,
          city = excluded.city,
          parcel = excluded.parcel,
          is_block_permit = excluded.is_block_permit,
          is_accelerated = excluded.is_accelerated,
          invoice_number = excluded.invoice_number,
          invoice_charges = excluded.invoice_charges,
          invoice_balance = excluded.invoice_balance,
          raw_export = excluded.raw_export,
          exported_at = now()`,
        [
          record.applicationId,
          record.facilityId,
          record.facilityName,
          record.projectName,
          record.companyId,
          record.companyName,
          record.status,
          record.submittedDate,
          record.effectiveDate,
          record.expirationDate,
          record.closedDate,
          record.previousAppId,
          record.projectStartDate,
          record.projectCompletionDate,
          record.address,
          record.city,
          record.parcel,
          record.isBlockPermit,
          record.isAccelerated,
          record.invoiceNumber,
          record.invoiceCharges,
          record.invoiceBalance,
          {
            ...record,
            coordinates: record.coordinates,
          },
        ]
      );
    }
  });

  return records.length;
}

export async function listPermitsNeedingDetailScrape(
  limit: number
): Promise<AQPermitListRow[]> {
  if (limit <= 0) {
    return [];
  }

  return await db
    .query<AQPermitListRow>(
      `SELECT id, status
       FROM aqdata_permits
       WHERE detail_scraped_at IS NULL
       ORDER BY exported_at DESC, id ASC
       LIMIT $1`
    )
    .all(limit);
}

export async function savePermitDetail(
  permitId: string,
  detailHtml: string,
  detail: DustApplicationDetail,
  qa: DustApplicationDetailQAResult
): Promise<void> {
  await db.run(
    `UPDATE aqdata_permits
     SET detail_html = $1,
         detail_fields = $2::jsonb,
         detail_scraped_at = now()
     WHERE id = $3`,
    [detailHtml, buildDetailPayload(detail, qa), permitId]
  );
}

function buildDetailPayload(
  detail: DustApplicationDetail,
  qa: DustApplicationDetailQAResult
): Record<string, unknown> {
  return {
    attachments: detail.attachments,
    coordinates: detail.coordinates,
    detailFields: detail.detailFields,
    documentLinks: detail.documentLinks,
    permitDocument: detail.permitDocument,
    permitPdf: detail.permitPdf,
    qa,
    structured: detail.structured,
  };
}
