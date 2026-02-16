/**
 * Monday workspace, board, column, and data shape types.
 */

/**
 * Monday.com Workspaces
 *
 * Note: There are two workspaces both named "Desert Services":
 * - 8970676: Main/Active CRM workspace (use this)
 * - 8240372: Old Procurement workspace (archived, data extracted to lib/db/procurement.db)
 */
export const WORKSPACE_IDS = {
  /** Main active CRM workspace */
  MAIN: "8970676",
  /** Old Procurement workspace - archived, don't use */
  PROCUREMENT_ARCHIVED: "8240372",
} as const;

/**
 * Board IDs organized by workspace.
 */
export const BOARD_IDS = {
  // Main workspace
  ESTIMATING: "7943937851",
  LEADS: "7943937841",
  CONTRACTORS: "7943937856",
  CONTACTS: "7943937855",
  PROJECTS: "8692330900",
  DUST_PERMITS: "9850624269",
  INSPECTION_REPORTS: "8791849123",
  SWPPP_PLANS: "9778304069",
  INCOMING_CALLS: "9707280603",
  FIELD_OPPORTUNITIES: "9812137726",

  // Procurement workspace (archived)
  OPEN_BIDS: "7505227263",
  BIDS_SENT: "7505653112",
  CHECKLIST: "7844326622",
  DUST_PERMITS_WM: "7816215167",
  SIGNAGE: "7887806194",
  SWPPP_MASTER: "8304407803",
  INSPECTIONS_WM: "8781744032",
} as const;

export type BoardId = (typeof BOARD_IDS)[keyof typeof BOARD_IDS];

/**
 * Column definition with ID and type for smart handling.
 */
export interface ColumnDef {
  id: string;
  type:
    | "name"
    | "text"
    | "status"
    | "file"
    | "mirror"
    | "board_relation"
    | "email"
    | "phone"
    | "people"
    | "date"
    | "numbers"
    | "checkbox"
    | "link"
    | "location"
    | "dropdown";
}

/**
 * ESTIMATING board columns - most commonly searched.
 */
export const ESTIMATING_COLUMNS = {
  NAME: { id: "name", type: "name" },
  CONTRACTOR: { id: "deal_account", type: "mirror" },
  ESTIMATE_ID: { id: "text_mkseybgg", type: "text" },
  PLANS: { id: "file_mkseqmab", type: "file" },
  ESTIMATE: { id: "file_mksebs2e", type: "file" },
  CONTRACTS: { id: "file_mkxs157q", type: "file" },
  NOI: { id: "file_mkxskqtt", type: "file" },
  CONTRACTORS_DIRECT: { id: "board_relation_mkzdd0r4", type: "board_relation" },
  CONTACTS_DIRECT: { id: "board_relation_mm065k5n", type: "board_relation" },
  ACCOUNTS: { id: "board_relation_mkzdd0r4", type: "board_relation" },
  BID_STATUS: { id: "deal_stage", type: "status" },
  BID_VALUE: { id: "deal_value", type: "numbers" },
  AWARDED_VALUE: { id: "deal_actual_value", type: "numbers" },
  BID_SOURCE: { id: "color_mksetd6e", type: "status" },
  OWNER: { id: "deal_owner", type: "people" },
  DUE_DATE: { id: "date_mksf70mc", type: "date" },
  BID_SENT_DATE: { id: "date_mksfz5mn", type: "date" },
  CLOSE_DATE: { id: "deal_close_date", type: "date" },
  PROJECT_START_DATE: { id: "date_mktggxm", type: "date" },
  PROJECT_END_DATE: { id: "date_mktgw5mt", type: "date" },
  LOCATION: { id: "location_mksej8dy", type: "location" },
  SERVICE_LINES: { id: "board_relation_mktgzr87", type: "board_relation" },
  SWPPP_PLAN: { id: "color_mktmdrgk", type: "status" },
  AWARDED: { id: "boolean_mkth6sm9", type: "checkbox" },
  SHAREPOINT_URL: { id: "link_mky1n6pa", type: "link" },
  CONTACTS: { id: "deal_contact", type: "board_relation" },
  ONSITE_CONTACT: { id: "board_relation_mktg153g", type: "board_relation" },
  SALES_CONTACT: { id: "board_relation_mktga7k4", type: "board_relation" },
  DUST_PERMITS: { id: "board_relation_mkxm6jb1", type: "board_relation" },
  PROJECTS: { id: "board_relation_mktgebxf", type: "board_relation" },
  FIELD_OPPORTUNITY: { id: "board_relation_mkvwwg0w", type: "board_relation" },
} as const satisfies Record<string, ColumnDef>;

/**
 * CONTACTS board columns.
 */
export const CONTACTS_COLUMNS = {
  NAME: { id: "name", type: "name" },
  EMAIL: { id: "contact_email", type: "email" },
  PHONE: { id: "contact_phone", type: "phone" },
  MOBILE_PHONE: { id: "phone_mm08b5ke", type: "phone" },
  OFFICE_PHONE: { id: "phone_mm0823m3", type: "phone" },
  COMPANY_PHONE: { id: "phone_mm08h32d", type: "phone" },
  COMPANY_FAX: { id: "phone_mm0830rr", type: "phone" },
  TITLE: { id: "title5", type: "dropdown" },
  TITLE_LABEL: { id: "color_mkzeg15b", type: "status" },
  PRIORITY: { id: "status5", type: "status" },
  CONTRACTOR: { id: "contact_account", type: "board_relation" },
  PROJECTS: { id: "board_relation_mkp8e0s2", type: "board_relation" },
  TERRITORY_OWNER: { id: "multiple_person_mkx1zntf", type: "people" },
  IMPORTED_ACCOUNT_NAME: { id: "text_mksap5xg", type: "text" },
  IMPORTED_PHONE: { id: "text_mkp9v76p", type: "text" },
  CONTRACTOR_MATCHED: { id: "color_mksdx7dd", type: "status" },
  PHONE_MATCHED: { id: "color_mksencpn", type: "status" },
} as const satisfies Record<string, ColumnDef>;

/**
 * CONTRACTORS board columns (accounts/companies).
 */
export const CONTRACTORS_COLUMNS = {
  ACCOUNT_OWNER: { id: "multiple_person_mkwbmdwz", type: "people" },
  ACCOUNT_TYPE: { id: "color_mkp055db", type: "status" },
  COMPANY_PROFILE: { id: "company_profile", type: "link" },
  CONTACTS: { id: "account_contact", type: "board_relation" },
  DESCRIPTION: { id: "company_description", type: "text" },
  DOMAIN: { id: "company_domain", type: "link" },
  DOMAIN_ACTIVE: { id: "status", type: "status" },
  EMPLOYEE_COUNT: { id: "employee_count", type: "text" },
  ESTIMATING_LINK: { id: "board_relation_mkzd8h88", type: "board_relation" },
  HEADQUARTERS: { id: "headquarters_loc", type: "text" },
  INDUSTRY: { id: "industry", type: "dropdown" },
  LAST_CONTACTED: { id: "date_mkp0msw1", type: "date" },
  NAME: { id: "name", type: "name" },
  PREF_FENCE_VENDOR: { id: "color_mkp0z3hj", type: "status" },
  PREF_PORTO_VENDOR: { id: "color_mkp0pg9v", type: "status" },
  PREF_STORM_VENDOR: { id: "color_mkp0xrh", type: "status" },
  PRIORITY: { id: "status5", type: "status" },
  PROJECT_TYPES: { id: "dropdown_mkp0qb0", type: "dropdown" },
  SHAREPOINT_URL: { id: "link_mkzd48rf", type: "link" },
  STATUS: { id: "color_mkzdgq5j", type: "status" },
} as const satisfies Record<string, ColumnDef>;

export const BOARD_COLUMNS = {
  CONTACTS: CONTACTS_COLUMNS,
  CONTRACTORS: CONTRACTORS_COLUMNS,
  ESTIMATING: ESTIMATING_COLUMNS,
} as const;

/**
 * Get column ID from friendly name for a board.
 */
export function getColumnId(
  boardName: keyof typeof BOARD_COLUMNS,
  columnName: string
): string | undefined {
  const columns = BOARD_COLUMNS[boardName];
  const upperName = columnName.toUpperCase().replaceAll(/[\s-]/g, "_");

  if (upperName in columns) {
    return (columns as Record<string, ColumnDef>)[upperName]?.id;
  }

  return columnName;
}

/**
 * Get column type from ID for a board.
 */
export function getColumnType(
  boardName: keyof typeof BOARD_COLUMNS,
  columnId: string
): ColumnDef["type"] | undefined {
  const columns = BOARD_COLUMNS[boardName];
  for (const col of Object.values(columns)) {
    if (col.id === columnId) {
      return col.type;
    }
  }
  return;
}

export interface MondayItem {
  id: string;
  name: string;
  groupId: string;
  groupTitle: string;
  url: string;
  columns: Record<string, string>;
}

export interface MondayBoard {
  id: string;
  name: string;
  groups: { id: string; title: string }[];
}

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export interface MondayAsset {
  id: string;
  name: string;
  url: string;
  public_url: string;
  file_extension: string;
  file_size: number;
  created_at: string;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}
