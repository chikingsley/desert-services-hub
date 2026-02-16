/**
 * Constants and column maps for Procurement extraction.
 */

export const DB_PATH = "lib/db/procurement.db";

// Board IDs for Procurement workspace
export const BOARDS = {
  BIDS_SENT: 7_505_653_112,
  CHECKLIST: 7_844_326_622,
  DUST_PERMITS_WM: 7_816_215_167,
  INSPECTIONS_WM: 8_781_744_032,
  OPEN_BIDS: 7_505_227_263,
  SIGNAGE: 7_887_806_194,
  SWPPP_MASTER: 8_304_407_803,
} as const;

// Column mappings per board (column_id -> friendly_name)
export const _OPEN_BIDS_COLUMNS: Record<string, keyof ProcurementColumns> = {
  date: "due_date",
  date6__1: "sent_date",
  date__1: "date_received",
  dropdown_1_mkm99hgx: "service_lines",
  dropdown_mkm9dkf5: "project_type",
  dup__of_swppp__1: "certified_payroll",
  email__1: "email",
  location__1: "location",
  name: "name",
  numbers__1: "bid_amount",
  numbers_mkm9r4wq: "site_sqft",
  numbers_mkm9wtzv: "building_sqft",
  phone__1: "phone",
  status1__1: "status",
  status__1: "sent_via",
  text3__1: "contact_name",
  text6__1: "contractor_name",
  text__1: "estimate_number",
};

export const _BIDS_SENT_COLUMNS: Record<string, keyof ProcurementColumns> = {
  color_mksncnn4: "sent_via",
  color_mktap0yn: "tivan_records_match",
  date7__1: "date_won",
  date8__1: "date_sent",
  date_mkm9nmy5: "project_end_date",
  date_mksn5mrj: "due_date",
  date_mksn9ep4: "date_received",
  dropdown_mkm9x6pr: "dropdown",
  dropdown_mksnvhpm: "service_lines",
  email__1: "email",
  location__1: "location",
  name: "name",
  numbers_1_mkm9b4q3: "building_sqft",
  numbers__1: "bid_amount",
  numbers_mkm9ejjp: "acreage",
  phone__1: "phone",
  status1__1: "status",
  tags_mkm974cg: "tags",
  text7__1: "contact_name",
  text_1__1: "contractor_name",
  text__1: "estimate_number",
};

export const _CHECKLIST_COLUMNS: Record<string, keyof ProcurementColumns> = {
  color_mkpf8bsg: "signage_status",
  color_mkpfbvh0: "inspections_status",
  color_mkpfnqa2: "dust_permit_status",
  color_mkpfrwgj: "swppp_plan_status",
  date_mkmfc6xn: "date_signed",
  email_mkpfdxvb: "contract_email",
  email_mkpfy49j: "onsite_email",
  location_mkmfzfrc: "location",
  name: "name",
  phone_mkpfywyh: "onsite_phone",
  status: "contract_status",
  text8__1: "estimate_number",
  text__1: "contractor",
  text_mkpf4z6n: "extract_info",
  text_mkpfegjb: "onsite_title",
  text_mkpfhy89: "onsite_contact",
};

export const _DUST_PERMITS_COLUMNS: Record<string, keyof ProcurementColumns> = {
  color_mkpt9x46: "county",
  date4: "last_activity_date",
  date_1__1: "due_date_renewal",
  name: "name",
  status: "status",
  status_1__1: "type",
  text1__1: "permit_number",
  text__1: "contractor",
};

export const _SIGNAGE_COLUMNS: Record<string, keyof ProcurementColumns> = {
  date4: "date_received",
  date__1: "projected_install_date",
  dropdown__1: "signage_type",
  email_1__1: "initial_contact_email",
  email__1: "onsite_contact_email",
  location__1: "site_location",
  name: "name",
  phone__1: "onsite_contact_phone",
  status: "status",
  text0__1: "initial_contact_name",
  text6__1: "contractor",
  text__1: "onsite_contact_name",
  true___false__1: "same_as_install",
};

export const _SWPPP_MASTER_COLUMNS: Record<string, keyof ProcurementColumns> = {
  date4: "install_date",
  date_1_mkmenmv7: "date_entered",
  location_mkmee0sa: "address",
  name: "name",
  phone_mkme6zwe: "phone",
  status_mkmejf6y: "status",
  text_mkme3y65: "owner_contractor",
  text_mkme7jmg: "item_id",
  text_mkme8mas: "comments",
  text_mkmeb0jv: "job_description",
  text_mkmebg9t: "sw21_103_43",
  text_mkmek920: "contact",
  text_mkmekmpq: "project_name",
  text_mkmez2vn: "work_completed",
};

export const _INSPECTIONS_COLUMNS: Record<string, keyof ProcurementColumns> = {
  color_mkpc96w1: "status",
  date_mkpcg9ct: "install_date",
  email_mkpc9km7: "email",
  location_mkpcz27f: "location",
  name: "name",
  phone_mkpca1ph: "phone",
  text_mkpccaf3: "contact",
  text_mkpcgvze: "company_name",
  text_mkpcx154: "address",
};

interface ProcurementColumns {
  [key: string]: string;
}

export interface ProcurementItem {
  columns: Record<string, string | undefined>;
}

export function getColumn(
  item: ProcurementItem,
  columnId: string
): string | null {
  return item.columns[columnId] ?? null;
}
