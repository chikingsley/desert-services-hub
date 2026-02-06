/**
 * Create Flow Utilities
 *
 * Barrel export for all create flow functions.
 * This module handles creating new dust permit applications in the Maricopa County
 * dust permit portal. Supports new company, existing company, and renewal flows.
 *
 * Flow: My Dust Apps → New Application Popup → Page 1 (Applicant) → Page 2 (Location)
 *       → Page 3 (Project Details) → Page 4 (Dust Control) → Page 5 (Submit)
 *
 * Note: State verification functions (getPageXState) are test utilities and are
 * located in tests/e2e/utils/page-state.ts
 */

// Re-export fill functions
export {
  fillPage1,
  fillPage2,
  fillPage2Renew,
  fillPage3,
  fillPage4,
} from "./fill";
