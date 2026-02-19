import type { Database } from "bun:sqlite";
import { getItemsRich, type MondayItemRich } from "@monday/client/rich";
import { BOARDS } from "./schema";

function extractColumn(item: MondayItemRich, columnId: string): string | null {
  return item.columns[columnId] ?? null;
}

function extractNumber(item: MondayItemRich, columnId: string): number | null {
  const val = item.columns[columnId];
  if (val === null || val === undefined || val === "") {
    return null;
  }
  const num = Number.parseFloat(String(val));
  return Number.isNaN(num) ? null : num;
}

function extractBoolean(item: MondayItemRich, columnId: string): number | null {
  const val = item.columns[columnId];
  if (val === null || val === undefined) {
    return null;
  }

  return val === "v" || val === "true" ? 1 : 0;
}

export async function extractOpenBids(db: Database): Promise<number> {
  const items = await getItemsRich(String(BOARDS.OPEN_BIDS));
  const stmt = db.query(`
    INSERT OR REPLACE INTO open_bids (
      monday_id, name, group_id, group_title,
      contractor_name, contact_name, phone, email,
      due_date, location, sent_via, status,
      estimate_number, bid_amount, service_lines, project_type,
      site_sqft, building_sqft, certified_payroll,
      date_received, sent_date, raw_columns
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text6__1"),
      extractColumn(item, "text3__1"),
      extractColumn(item, "phone__1"),
      extractColumn(item, "email__1"),
      extractColumn(item, "date"),
      extractColumn(item, "location__1"),
      extractColumn(item, "status__1"),
      extractColumn(item, "status1__1"),
      extractColumn(item, "text__1"),
      extractNumber(item, "numbers__1"),
      extractColumn(item, "dropdown_1_mkm99hgx"),
      extractColumn(item, "dropdown_mkm9dkf5"),
      extractNumber(item, "numbers_mkm9r4wq"),
      extractNumber(item, "numbers_mkm9wtzv"),
      extractBoolean(item, "dup__of_swppp__1"),
      extractColumn(item, "date__1"),
      extractColumn(item, "date6__1"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

export async function extractBidsSent(db: Database): Promise<number> {
  const items = await getItemsRich(String(BOARDS.BIDS_SENT));
  const stmt = db.query(`
    INSERT OR REPLACE INTO bids_sent (
      monday_id, name, group_id, group_title,
      contractor_name, contact_name, phone, email,
      date_sent, date_won, location, estimate_number,
      bid_amount, status, project_end_date, tags,
      acreage, building_sqft, sent_via, date_received,
      due_date, service_lines, tivan_records_match, raw_columns
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text_1__1"),
      extractColumn(item, "text7__1"),
      extractColumn(item, "phone__1"),
      extractColumn(item, "email__1"),
      extractColumn(item, "date8__1"),
      extractColumn(item, "date7__1"),
      extractColumn(item, "location__1"),
      extractColumn(item, "text__1"),
      extractNumber(item, "numbers__1"),
      extractColumn(item, "status1__1"),
      extractColumn(item, "date_mkm9nmy5"),
      extractColumn(item, "tags_mkm974cg"),
      extractNumber(item, "numbers_mkm9ejjp"),
      extractNumber(item, "numbers_1_mkm9b4q3"),
      extractColumn(item, "color_mksncnn4"),
      extractColumn(item, "date_mksn9ep4"),
      extractColumn(item, "date_mksn5mrj"),
      extractColumn(item, "dropdown_mksnvhpm"),
      extractColumn(item, "color_mktap0yn"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

export async function extractChecklist(db: Database): Promise<number> {
  const items = await getItemsRich(String(BOARDS.CHECKLIST));
  const stmt = db.query(`
    INSERT OR REPLACE INTO checklist (
      monday_id, name, group_id, group_title,
      contractor, location, contract_status, signage_status,
      dust_permit_status, swppp_plan_status, inspections_status,
      date_signed, estimate_number, extract_info,
      contract_email, onsite_title, onsite_email,
      onsite_phone, onsite_contact, raw_columns
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text__1"),
      extractColumn(item, "location_mkmfzfrc"),
      extractColumn(item, "status"),
      extractColumn(item, "color_mkpf8bsg"),
      extractColumn(item, "color_mkpfnqa2"),
      extractColumn(item, "color_mkpfrwgj"),
      extractColumn(item, "color_mkpfbvh0"),
      extractColumn(item, "date_mkmfc6xn"),
      extractColumn(item, "text8__1"),
      extractColumn(item, "text_mkpf4z6n"),
      extractColumn(item, "email_mkpfdxvb"),
      extractColumn(item, "text_mkpfegjb"),
      extractColumn(item, "email_mkpfy49j"),
      extractColumn(item, "phone_mkpfywyh"),
      extractColumn(item, "text_mkpfhy89"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

export async function extractDustPermits(db: Database): Promise<number> {
  const items = await getItemsRich(String(BOARDS.DUST_PERMITS_WM));
  const stmt = db.query(`
    INSERT OR REPLACE INTO dust_permits (
      monday_id, name, group_id, group_title,
      contractor, status, last_activity_date, type,
      permit_number, due_date_renewal, county, raw_columns
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text__1"),
      extractColumn(item, "status"),
      extractColumn(item, "date4"),
      extractColumn(item, "status_1__1"),
      extractColumn(item, "text1__1"),
      extractColumn(item, "date_1__1"),
      extractColumn(item, "color_mkpt9x46"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

export async function extractSignage(db: Database): Promise<number> {
  const items = await getItemsRich(String(BOARDS.SIGNAGE));
  const stmt = db.query(`
    INSERT OR REPLACE INTO signage (
      monday_id, name, group_id, group_title,
      status, date_received, projected_install_date, same_as_install,
      signage_type, onsite_contact_name, onsite_contact_email, onsite_contact_phone,
      site_location, initial_contact_name, initial_contact_email, contractor, raw_columns
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "status"),
      extractColumn(item, "date4"),
      extractColumn(item, "date__1"),
      extractBoolean(item, "true___false__1"),
      extractColumn(item, "dropdown__1"),
      extractColumn(item, "text__1"),
      extractColumn(item, "email__1"),
      extractColumn(item, "phone__1"),
      extractColumn(item, "location__1"),
      extractColumn(item, "text0__1"),
      extractColumn(item, "email_1__1"),
      extractColumn(item, "text6__1"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

export async function extractSwpppMaster(db: Database): Promise<number> {
  const items = await getItemsRich(String(BOARDS.SWPPP_MASTER));
  const stmt = db.query(`
    INSERT OR REPLACE INTO swppp_master (
      monday_id, name, group_id, group_title,
      install_date, status, owner_contractor, project_name,
      address, contact, phone, job_description,
      date_entered, comments, sw21_103_43, work_completed,
      item_id, raw_columns
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "date4"),
      extractColumn(item, "status_mkmejf6y"),
      extractColumn(item, "text_mkme3y65"),
      extractColumn(item, "text_mkmekmpq"),
      extractColumn(item, "location_mkmee0sa"),
      extractColumn(item, "text_mkmek920"),
      extractColumn(item, "phone_mkme6zwe"),
      extractColumn(item, "text_mkmeb0jv"),
      extractColumn(item, "date_1_mkmenmv7"),
      extractColumn(item, "text_mkme8mas"),
      extractColumn(item, "text_mkmebg9t"),
      extractColumn(item, "text_mkmez2vn"),
      extractColumn(item, "text_mkme7jmg"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

export async function extractInspections(db: Database): Promise<number> {
  const items = await getItemsRich(String(BOARDS.INSPECTIONS_WM));
  const stmt = db.query(`
    INSERT OR REPLACE INTO inspections (
      monday_id, name, group_id, group_title,
      company_name, install_date, location, contact,
      email, phone, address, status, raw_columns
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text_mkpcgvze"),
      extractColumn(item, "date_mkpcg9ct"),
      extractColumn(item, "location_mkpcz27f"),
      extractColumn(item, "text_mkpccaf3"),
      extractColumn(item, "email_mkpc9km7"),
      extractColumn(item, "phone_mkpca1ph"),
      extractColumn(item, "text_mkpcx154"),
      extractColumn(item, "color_mkpc96w1"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}
