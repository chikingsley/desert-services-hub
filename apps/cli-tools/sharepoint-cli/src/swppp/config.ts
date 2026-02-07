/**
 * SWPPP Master Excel Configuration
 *
 * Contains constants for accessing the SWPPP Master workbook in SharePoint.
 * Update ITEM_ID if the file is replaced/moved.
 *
 * Location: SharePoint DataDrive root
 * File: SWPPP Master 11-7-24.xlsx
 */

/**
 * SharePoint item ID for the SWPPP Master Excel file.
 * Found at: DataDrive (root) / SWPPP Master 11-7-24.xlsx
 *
 * To find a new ID if the file changes:
 * ```ts
 * const files = await sp.listFiles('/');
 * const master = files.find(f => f.name.includes('SWPPP Master'));
 * console.log(master.id);
 * ```
 */
export const SWPPP_MASTER_ITEM_ID = "01J5LMOW6ZZM3IEAIWQVFYCABQJSB4LX42";

/**
 * Worksheet names in the SWPPP Master workbook
 */
export const WORKSHEETS = {
  /** Projects that need to be scheduled (pending) */
  NEED_TO_SCHEDULE: "Need to Schedule",
  /** Projects with confirmed schedule dates */
  CONFIRMED_SCHEDULE: "Confirmed Schedule",
  /** Historical billing & verification records (~2700 rows) */
  BILLING_VERIFICATION: "SWPPP B & V",
} as const;

export type WorksheetName = (typeof WORKSHEETS)[keyof typeof WORKSHEETS];

/**
 * Column mappings for each worksheet.
 * Index corresponds to Excel column position (0-based).
 */
export const COLUMNS = {
  [WORKSHEETS.NEED_TO_SCHEDULE]: {
    DATE: 0,
    CONTRACTOR: 1,
    JOB_NAME: 2,
    ADDRESS: 3,
    CONTACT: 4,
    PHONE: 5,
    WORK_DESCRIPTION: 6,
    DATE_CONFIRMED: 7,
    COMMENTS: 8,
    INVOICE: 9,
    WORK_COMPLETED: 10,
  },
  [WORKSHEETS.CONFIRMED_SCHEDULE]: {
    DATE: 0,
    CONTRACTOR: 1,
    JOB_NAME: 2,
    ADDRESS: 3,
    CONTACT: 4,
    PHONE: 5,
    JOB_DESCRIPTION: 6,
    DATE_ENTERED: 7,
    COMMENTS: 8,
    INVOICE: 9,
  },
  [WORKSHEETS.BILLING_VERIFICATION]: {
    INSTALL_DATE: 0,
    CONTRACTOR: 1,
    JOB_NAME: 2,
    // Column 3 is empty in B&V
    CONTACT: 4,
    PHONE: 5,
    WORK_DESCRIPTION: 6,
    DATE_ENTERED: 7,
    COMMENTS: 8,
    INVOICE: 9,
    WORK_COMPLETED: 10,
  },
} as const;

/**
 * Normalized column names for SQLite storage.
 * Maps the varying Excel column names to consistent field names.
 */
export const NORMALIZED_COLUMNS = [
  "date",
  "contractor",
  "job_name",
  "address",
  "contact",
  "phone",
  "work_description",
  "date_entered",
  "comments",
  "invoice",
  "work_completed",
] as const;

export type NormalizedColumn = (typeof NORMALIZED_COLUMNS)[number];
