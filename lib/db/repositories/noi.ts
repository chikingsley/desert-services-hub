/**
 * NOI Extraction Repository
 */
import { db } from "@lib/db/hub";
import type { InsertNOIData, NOIExtraction } from "@lib/db/types";

function parseNOIRow(row: Record<string, unknown>): NOIExtraction {
  return {
    id: row.id as number,
    projectId: row.project_id as number | null,
    sourceEmailId: row.source_email_id as number | null,
    sourceAttachmentId: row.source_attachment_id as number | null,
    filePath: row.file_path as string | null,
    fileName: row.file_name as string | null,
    permitId: row.permit_id as string | null,
    ltfNumber: row.ltf_number as string | null,
    applicantName: row.applicant_name as string,
    applicantAddress1: row.applicant_address1 as string | null,
    applicantAddress2: row.applicant_address2 as string | null,
    applicantCity: row.applicant_city as string | null,
    applicantState: row.applicant_state as string | null,
    applicantZip: row.applicant_zip as string | null,
    siteName: row.site_name as string,
    siteAddress: row.site_address as string | null,
    latitude: row.latitude as number | null,
    longitude: row.longitude as number | null,
    acresDisturbed: row.acres_disturbed as number | null,
    swpppContactFirstName: row.swppp_contact_first_name as string | null,
    swpppContactLastName: row.swppp_contact_last_name as string | null,
    swpppContactEmail: row.swppp_contact_email as string | null,
    swpppContactPhone: row.swppp_contact_phone as string | null,
    extractionConfidence: (row.extraction_confidence as string) ?? "high",
    missingFields: (row.missing_fields as string[]) ?? [],
    warnings: (row.warnings as string[]) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const insertStmt = db.prepare(`
  INSERT INTO noi_extractions (
    project_id, source_email_id, source_attachment_id,
    file_path, file_name,
    permit_id, ltf_number,
    applicant_name, applicant_address1, applicant_address2,
    applicant_city, applicant_state, applicant_zip,
    site_name, site_address, latitude, longitude, acres_disturbed,
    swppp_contact_first_name, swppp_contact_last_name,
    swppp_contact_email, swppp_contact_phone,
    extraction_confidence, missing_fields, warnings
  ) VALUES (
    ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?::jsonb, ?::jsonb
  )
  RETURNING id
`);

export async function insertNOI(data: InsertNOIData): Promise<number> {
  const row = await insertStmt.get(
    data.projectId ?? null,
    data.sourceEmailId ?? null,
    data.sourceAttachmentId ?? null,
    data.filePath ?? null,
    data.fileName ?? null,
    data.permitId ?? null,
    data.ltfNumber ?? null,
    data.applicantName,
    data.applicantAddress1 ?? null,
    data.applicantAddress2 ?? null,
    data.applicantCity ?? null,
    data.applicantState ?? null,
    data.applicantZip ?? null,
    data.siteName,
    data.siteAddress ?? null,
    data.latitude ?? null,
    data.longitude ?? null,
    data.acresDisturbed ?? null,
    data.swpppContactFirstName ?? null,
    data.swpppContactLastName ?? null,
    data.swpppContactEmail ?? null,
    data.swpppContactPhone ?? null,
    data.extractionConfidence ?? "high",
    JSON.stringify(data.missingFields ?? []),
    JSON.stringify(data.warnings ?? [])
  );
  return (row as { id: number }).id;
}

export async function getNOIByProject(
  projectId: number
): Promise<NOIExtraction | null> {
  const row = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM noi_extractions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(projectId);
  return row ? parseNOIRow(row) : null;
}

export async function getNOIByPermitId(
  permitId: string
): Promise<NOIExtraction | null> {
  const row = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM noi_extractions WHERE permit_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(permitId);
  return row ? parseNOIRow(row) : null;
}

export async function getAllNOIs(): Promise<NOIExtraction[]> {
  const rows = await db
    .query<Record<string, unknown>, []>(
      "SELECT * FROM noi_extractions ORDER BY created_at DESC"
    )
    .all();
  return rows.map(parseNOIRow);
}
