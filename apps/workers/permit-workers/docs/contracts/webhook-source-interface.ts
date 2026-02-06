/**
 * Webhook Source Interface Contract
 *
 * This defines the data contract that any webhook source (Notion, Monday.com, custom dashboard)
 * must provide to trigger a dust permit application.
 *
 * The webhook source is responsible for:
 * 1. Collecting project information (name, account)
 * 2. Providing URLs to download required PDF files (NOI, SWPPP Plan)
 * 3. Triggering the pipeline via API endpoint
 *
 * The automation pipeline handles:
 * 1. Downloading PDFs from provided URLs
 * 2. Extracting data from PDFs
 * 3. Converting to FormData
 * 4. Filling the dust permit form
 */

// ============================================================================
// Core Interface
// ============================================================================

export interface ProjectFile {
  /** Display name of the file */
  name: string;

  /** URL to download the PDF file */
  url: string;
}

export interface ProjectFiles {
  /** Human-readable project name */
  projectName: string;

  /** Optional: Account/company name if available in source */
  accountName?: string;

  /** Array of NOI (Notice of Intent) PDFs - at least one required */
  noi: ProjectFile[];

  /** Array of SWPPP Plan PDFs - optional, defaults used if not provided */
  swpppPlan: ProjectFile[];
}

// ============================================================================
// Example Payloads
// ============================================================================

/**
 * Example payload for minimal project (only NOI)
 */
export const minimalProjectFilesExample: ProjectFiles = {
  projectName: "Downtown Tower Construction",
  accountName: "Sundt Construction",
  noi: [
    {
      name: "NOI-2025-001.pdf",
      url: "https://storage.example.com/noi-2025-001.pdf",
    },
  ],
  swpppPlan: [],
};

/**
 * Example payload for full project (NOI + SWPPP Plan)
 */
export const fullProjectFilesExample: ProjectFiles = {
  projectName: "Phoenix Commercial Center",
  accountName: "DLR Group",
  noi: [
    {
      name: "NOI-Phoenix-Commercial.pdf",
      url: "https://storage.example.com/noi-phoenix.pdf",
    },
  ],
  swpppPlan: [
    {
      name: "SWPPP-Plan-Phoenix.pdf",
      url: "https://storage.example.com/swppp-phoenix.pdf",
    },
  ],
};

// ============================================================================
// API Contract
// ============================================================================

/**
 * Webhook endpoint: POST /api/applications/create
 *
 * This endpoint accepts ProjectFiles and runs the full pipeline:
 * 1. Download PDFs from URLs
 * 2. Extract data from PDFs
 * 3. Build FormData
 * 4. Fill dust permit application
 *
 * @see server/API.md for detailed API documentation
 */
export interface CreateApplicationRequest {
  projectFiles: ProjectFiles;

  /** Optional: Dry run - extract only, don't fill form */
  dryRun?: boolean;

  /** Optional: Callback URL for progress updates */
  callbackUrl?: string;
}

export interface CreateApplicationResponse {
  success: boolean;

  applicationId?: string;

  formData?: Record<string, unknown>;

  errors: string[];

  warnings: string[];

  timings: {
    downloadMs: number;
    extractionMs: number;
    adapterMs: number;
    formFillMs: number;
    totalMs: number;
  };
}
