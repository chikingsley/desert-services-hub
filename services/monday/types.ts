/**
 * Monday.com Service Types
 */

// ============================================================================
// Board IDs Reference
// ============================================================================

/**
 * Primary workspace board IDs - Sales CRM
 */
export const BOARD_IDS = {
  // Sales CRM boards
  ESTIMATING: "7943937851",
  LEADS: "7943937841",
  CONTRACTORS: "7943937856",
  CONTACTS: "7943937855",
  PROJECTS: "8692330900",
  DUST_PERMITS: "9850624269",
  INSPECTION_REPORTS: "8791849123",
  SWPPP_PLANS: "9778304069",

  // Work Management boards
  OPEN_BIDS: "7505227263",
  BIDS_SENT: "7505653112",
  CHECKLIST: "7844326622",
  DUST_PERMITS_WM: "7816215167", // 4.a. Dust Permits (Work Management version)
  SIGNAGE: "7887806194", // 4.b. Signage
  SWPPP_MASTER: "8304407803", // 4.c. SWPPP Master
  INSPECTIONS_WM: "8781744032", // 4.d. Inspections

  // Other useful boards
  INCOMING_CALLS: "9707280603",
  FIELD_OPPORTUNITIES: "9812137726",
} as const;

export type BoardId = (typeof BOARD_IDS)[keyof typeof BOARD_IDS];

// ============================================================================
// Column Definitions
// ============================================================================

/**
 * Column definition with ID and type for smart handling
 */
export type ColumnDef = {
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
};

/**
 * ESTIMATING board columns - most commonly searched
 */
export const ESTIMATING_COLUMNS = {
  NAME: { id: "name", type: "name" },
  CONTRACTOR: { id: "deal_account", type: "mirror" },
  ESTIMATE_ID: { id: "text_mkseybgg", type: "text" },
  PLANS: { id: "file_mkseqmab", type: "file" },
  ESTIMATE: { id: "file_mksebs2e", type: "file" },
  CONTRACTS: { id: "file_mkxs157q", type: "file" },
  NOI: { id: "file_mkxskqtt", type: "file" },
  ACCOUNTS: { id: "board_relation_mkzdd0r4", type: "board_relation" },
  BID_STATUS: { id: "deal_stage", type: "status" },
  BID_VALUE: { id: "deal_value", type: "numbers" },
  AWARDED_VALUE: { id: "deal_actual_value", type: "numbers" },
  BID_SOURCE: { id: "color_mksetd6e", type: "status" },
  OWNER: { id: "deal_owner", type: "people" },
  DUE_DATE: { id: "date_mksf70mc", type: "date" },
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
} as const satisfies Record<string, ColumnDef>;

/**
 * CONTACTS board columns
 */
export const CONTACTS_COLUMNS = {
  NAME: { id: "name", type: "name" },
  EMAIL: { id: "contact_email", type: "email" },
  PHONE: { id: "contact_phone", type: "phone" },
  TITLE: { id: "title5", type: "dropdown" },
  PRIORITY: { id: "status5", type: "status" },
  CONTRACTOR: { id: "contact_account", type: "board_relation" },
  PROJECTS: { id: "board_relation_mkp8e0s2", type: "board_relation" },
  TERRITORY_OWNER: { id: "multiple_person_mkx1zntf", type: "people" },
} as const satisfies Record<string, ColumnDef>;

/**
 * All board columns indexed by board name
 */
export const BOARD_COLUMNS = {
  ESTIMATING: ESTIMATING_COLUMNS,
  CONTACTS: CONTACTS_COLUMNS,
} as const;

/**
 * Get column ID from friendly name for a board
 */
export function getColumnId(
  boardName: keyof typeof BOARD_COLUMNS,
  columnName: string
): string | undefined {
  const columns = BOARD_COLUMNS[boardName];
  const upperName = columnName.toUpperCase().replace(/[\s-]/g, "_");

  if (upperName in columns) {
    return (columns as Record<string, ColumnDef>)[upperName]?.id;
  }

  // If not found by friendly name, return as-is (might be raw column ID)
  return columnName;
}

/**
 * Get column type from ID for a board
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

// ============================================================================
// Data Types
// ============================================================================

export type MondayItem = {
  id: string;
  name: string;
  groupId: string;
  groupTitle: string;
  url: string;
  columns: Record<string, string>;
};

export type MondayBoard = {
  id: string;
  name: string;
  groups: Array<{ id: string; title: string }>;
};

export type MondayGroup = {
  id: string;
  title: string;
};

export type MondayColumn = {
  id: string;
  title: string;
  type: string;
};

export type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};
