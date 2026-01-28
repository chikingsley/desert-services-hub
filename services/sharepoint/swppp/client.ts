/**
 * SWPPP Master Client
 *
 * Direct access to SWPPP Master Excel data via SharePoint Graph API.
 * Use this for real-time queries when you need fresh data.
 * For high-volume queries, use the SQLite-synced version instead.
 */

import { SharePointClient } from "../client";
import {
  COLUMNS,
  SWPPP_MASTER_ITEM_ID,
  WORKSHEETS,
  type WorksheetName,
} from "./config";

// ============================================================================
// Types
// ============================================================================

export interface SwpppProject {
  /** Row number in the worksheet (1-based, excluding header) */
  rowNumber: number;
  /** Source worksheet */
  worksheet: WorksheetName;
  /** Scheduled/install date (Excel serial number or empty) */
  date: number | string | null;
  /** Contractor/owner name */
  contractor: string;
  /** Project/job name */
  jobName: string;
  /** Site address */
  address: string;
  /** Contact person name */
  contact: string;
  /** Phone number(s) */
  phone: string;
  /** Work description */
  workDescription: string;
  /** Date entered/confirmed */
  dateEntered: number | string | null;
  /** Comments */
  comments: string;
  /** Invoice number and date */
  invoice: string;
  /** Work completed notes (if applicable) */
  workCompleted: string;
}

export interface SearchOptions {
  /** Worksheet to search (default: all) */
  worksheet?: WorksheetName;
  /** Case-insensitive search in job name */
  jobName?: string;
  /** Case-insensitive search in contractor name */
  contractor?: string;
  /** Case-insensitive search across all text fields */
  query?: string;
  /** Maximum results to return */
  limit?: number;
}

// ============================================================================
// Client
// ============================================================================

export class SwpppMasterClient {
  private readonly sp: SharePointClient;
  private driveId: string | null = null;

  constructor(config?: {
    azureTenantId?: string;
    azureClientId?: string;
    azureClientSecret?: string;
  }) {
    this.sp = new SharePointClient({
      azureTenantId: config?.azureTenantId ?? process.env.AZURE_TENANT_ID ?? "",
      azureClientId: config?.azureClientId ?? process.env.AZURE_CLIENT_ID ?? "",
      azureClientSecret:
        config?.azureClientSecret ?? process.env.AZURE_CLIENT_SECRET ?? "",
    });
  }

  private async getDriveId(): Promise<string> {
    if (this.driveId) {
      return this.driveId;
    }
    this.driveId = await this.sp.getDefaultDriveId();
    return this.driveId;
  }

  /**
   * Get raw worksheet data as 2D array
   */
  async getWorksheetRaw(worksheet: WorksheetName): Promise<unknown[][]> {
    const driveId = await this.getDriveId();
    return this.sp.getWorksheetData(driveId, SWPPP_MASTER_ITEM_ID, worksheet);
  }

  /**
   * Get all projects from a worksheet as typed objects
   */
  async getProjects(worksheet: WorksheetName): Promise<SwpppProject[]> {
    const data = await this.getWorksheetRaw(worksheet);
    return this.parseWorksheet(worksheet, data);
  }

  /**
   * Get all projects from all worksheets
   */
  async getAllProjects(): Promise<SwpppProject[]> {
    const results: SwpppProject[] = [];

    for (const worksheet of Object.values(WORKSHEETS)) {
      const projects = await this.getProjects(worksheet);
      results.push(...projects);
    }

    return results;
  }

  /**
   * Search for projects matching criteria
   */
  async search(options: SearchOptions = {}): Promise<SwpppProject[]> {
    const { worksheet, jobName, contractor, query, limit } = options;

    // Get projects from specified worksheet or all
    let projects: SwpppProject[];
    if (worksheet) {
      projects = await this.getProjects(worksheet);
    } else {
      projects = await this.getAllProjects();
    }

    // Apply filters
    let filtered = projects;

    if (jobName) {
      const lowerJobName = jobName.toLowerCase();
      filtered = filtered.filter((p) =>
        p.jobName.toLowerCase().includes(lowerJobName)
      );
    }

    if (contractor) {
      const lowerContractor = contractor.toLowerCase();
      filtered = filtered.filter((p) =>
        p.contractor.toLowerCase().includes(lowerContractor)
      );
    }

    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter((p) => {
        const searchable = [
          p.jobName,
          p.contractor,
          p.address,
          p.contact,
          p.workDescription,
          p.comments,
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(lowerQuery);
      });
    }

    // Apply limit
    if (limit && limit > 0) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  /**
   * Find a project by exact or fuzzy job name match
   */
  async findProject(
    jobName: string,
    options: { fuzzy?: boolean; worksheet?: WorksheetName } = {}
  ): Promise<SwpppProject | null> {
    const projects = options.worksheet
      ? await this.getProjects(options.worksheet)
      : await this.getAllProjects();

    // Try exact match first
    const exactMatch = projects.find(
      (p) => p.jobName.toLowerCase() === jobName.toLowerCase()
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Fuzzy match if enabled
    if (options.fuzzy) {
      const lowerName = jobName.toLowerCase();
      const fuzzyMatch = projects.find((p) =>
        p.jobName.toLowerCase().includes(lowerName)
      );
      return fuzzyMatch ?? null;
    }

    return null;
  }

  /**
   * Get summary counts by worksheet
   */
  async getSummary(): Promise<{
    needToSchedule: number;
    confirmedSchedule: number;
    billingVerification: number;
    total: number;
  }> {
    const [needToSchedule, confirmedSchedule, billingVerification] =
      await Promise.all([
        this.getWorksheetRaw(WORKSHEETS.NEED_TO_SCHEDULE),
        this.getWorksheetRaw(WORKSHEETS.CONFIRMED_SCHEDULE),
        this.getWorksheetRaw(WORKSHEETS.BILLING_VERIFICATION),
      ]);

    return {
      needToSchedule: needToSchedule.length - 1,
      confirmedSchedule: confirmedSchedule.length - 1,
      billingVerification: billingVerification.length - 1,
      total:
        needToSchedule.length +
        confirmedSchedule.length +
        billingVerification.length -
        3,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private parseWorksheet(
    worksheet: WorksheetName,
    data: unknown[][]
  ): SwpppProject[] {
    // Skip header row
    const rows = data.slice(1);
    const cols = COLUMNS[worksheet];

    return rows.map((row, index) => {
      const getString = (idx: number | undefined): string => {
        if (idx === undefined) {
          return "";
        }
        const val = row[idx];
        return val === null || val === undefined ? "" : String(val);
      };

      const getDateOrNull = (
        idx: number | undefined
      ): number | string | null => {
        if (idx === undefined) {
          return null;
        }
        const val = row[idx];
        if (val === null || val === undefined || val === "") {
          return null;
        }
        return val as number | string;
      };

      // Handle different column layouts per worksheet
      if (worksheet === WORKSHEETS.BILLING_VERIFICATION) {
        const bvCols =
          cols as (typeof COLUMNS)[typeof WORKSHEETS.BILLING_VERIFICATION];
        return {
          rowNumber: index + 2, // 1-based, accounting for header
          worksheet,
          date: getDateOrNull(bvCols.INSTALL_DATE),
          contractor: getString(bvCols.CONTRACTOR),
          jobName: getString(bvCols.JOB_NAME),
          address: "", // B&V doesn't have address
          contact: getString(bvCols.CONTACT),
          phone: getString(bvCols.PHONE),
          workDescription: getString(bvCols.WORK_DESCRIPTION),
          dateEntered: getDateOrNull(bvCols.DATE_ENTERED),
          comments: getString(bvCols.COMMENTS),
          invoice: getString(bvCols.INVOICE),
          workCompleted: getString(bvCols.WORK_COMPLETED),
        };
      }

      if (worksheet === WORKSHEETS.NEED_TO_SCHEDULE) {
        const ntsCols =
          cols as (typeof COLUMNS)[typeof WORKSHEETS.NEED_TO_SCHEDULE];
        return {
          rowNumber: index + 2,
          worksheet,
          date: getDateOrNull(ntsCols.DATE),
          contractor: getString(ntsCols.CONTRACTOR),
          jobName: getString(ntsCols.JOB_NAME),
          address: getString(ntsCols.ADDRESS),
          contact: getString(ntsCols.CONTACT),
          phone: getString(ntsCols.PHONE),
          workDescription: getString(ntsCols.WORK_DESCRIPTION),
          dateEntered: getDateOrNull(ntsCols.DATE_CONFIRMED),
          comments: getString(ntsCols.COMMENTS),
          invoice: getString(ntsCols.INVOICE),
          workCompleted: getString(ntsCols.WORK_COMPLETED),
        };
      }

      // CONFIRMED_SCHEDULE
      const csCols =
        cols as (typeof COLUMNS)[typeof WORKSHEETS.CONFIRMED_SCHEDULE];
      return {
        rowNumber: index + 2,
        worksheet,
        date: getDateOrNull(csCols.DATE),
        contractor: getString(csCols.CONTRACTOR),
        jobName: getString(csCols.JOB_NAME),
        address: getString(csCols.ADDRESS),
        contact: getString(csCols.CONTACT),
        phone: getString(csCols.PHONE),
        workDescription: getString(csCols.JOB_DESCRIPTION),
        dateEntered: getDateOrNull(csCols.DATE_ENTERED),
        comments: getString(csCols.COMMENTS),
        invoice: getString(csCols.INVOICE),
        workCompleted: "",
      };
    });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let defaultClient: SwpppMasterClient | null = null;

function getDefaultClient(): SwpppMasterClient {
  if (!defaultClient) {
    defaultClient = new SwpppMasterClient();
  }
  return defaultClient;
}

/** Get all projects from a worksheet */
export const getProjects = (worksheet: WorksheetName) =>
  getDefaultClient().getProjects(worksheet);

/** Get all projects from all worksheets */
export const getAllProjects = () => getDefaultClient().getAllProjects();

/** Search for projects */
export const searchProjects = (options: SearchOptions) =>
  getDefaultClient().search(options);

/** Find a specific project by name */
export const findProject = (
  jobName: string,
  options?: { fuzzy?: boolean; worksheet?: WorksheetName }
) => getDefaultClient().findProject(jobName, options);

/** Get summary counts */
export const getSummary = () => getDefaultClient().getSummary();
