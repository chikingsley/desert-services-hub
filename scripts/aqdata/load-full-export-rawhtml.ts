import { readFileSync } from "node:fs";
import { db } from "@lib/db/client";

const PERMIT_ID_REGEX = /^D\d{7}$/i;

const path = process.argv[2];
if (!path) {
  throw new Error(
    "Usage: bun scripts/aqdata/load-full-export-rawhtml.ts <xls-html-path>"
  );
}

const html = readFileSync(path, "utf8");
const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
const tagRegex = /<[^>]+>/g;

const rows: string[][] = [];
for (const rowMatch of html.matchAll(rowRegex)) {
  const row = rowMatch[1] ?? "";
  const cells: string[] = [];
  for (const c of row.matchAll(cellRegex)) {
    const v = (c[1] ?? "")
      .replace(tagRegex, " ")
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&")
      .replace(/\s+/g, " ")
      .trim();
    cells.push(v);
  }
  if (cells.length > 0) {
    rows.push(cells);
  }
}

const dataRows = rows.filter((r) => PERMIT_ID_REGEX.test(r[0] ?? ""));
console.log(
  JSON.stringify(
    {
      totalRows: rows.length,
      permitRows: dataRows.length,
      firstIds: dataRows.slice(0, 10).map((r) => r[0]),
    },
    null,
    2
  )
);

for (const r of dataRows) {
  await db.run(
    `INSERT INTO aqdata_permits (
      id, facility_id, facility_name, project_name, company_id, company_name,
      status, submitted_date, effective_date, expiration_date, closed_date,
      previous_app_id, project_start_date, project_completion_date,
      address, city, parcel, is_block_permit, is_accelerated,
      invoice_number, invoice_charges, invoice_balance, raw_export, exported_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, now()
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
      r[0] ?? null,
      r[1] ?? null,
      r[2] ?? null,
      r[3] ?? null,
      r[4] ?? null,
      r[5] ?? null,
      r[6] ?? null,
      normalizeDate(r[7]),
      normalizeDate(r[8]),
      normalizeDate(r[9]),
      normalizeDate(r[10]),
      r[11] ?? null,
      normalizeDate(r[12]),
      normalizeDate(r[13]),
      r[14] ?? null,
      r[15] ?? null,
      r[16] ?? null,
      yesNo(r[17]),
      yesNo(r[18]),
      null,
      null,
      null,
      { cells: r },
    ]
  );
}

function yesNo(v?: string): boolean {
  return (v ?? "").toLowerCase() === "yes";
}
function normalizeDate(v?: string): string | null {
  if (!v) {
    return null;
  }
  const s = v.trim();
  if (!s) {
    return null;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
