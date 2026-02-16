/**
 * Create Flow Utilities
 *
 * Handles creating new dust permit applications in the Maricopa County
 * dust permit portal. Supports new company, existing company, and renewal flows.
 *
 * Flow: My Dust Apps → New Application Popup → Page 1 (Applicant) → Page 2 (Location)
 *       → Page 3 (Project Details) → Page 4 (Dust Control) → Page 5 (Submit)
 *
 * @module src/portal/create
 */

// Application creation
export {
  createExistingCompanyApplication,
  createNewCompanyApplication,
  createNewCompanyFreshApplication,
  createRenewApplication,
  createReviseApplication,
  getCreatedApplicationId,
  waitForApplicationCreated,
} from "./create/application";
// Fill functions (modularized)
export {
  fillPage1,
  fillPage2,
  fillPage2Renew,
  fillPage3,
  fillPage4,
} from "./create/fill";
// Full flows
export {
  createApplicationFull,
  fullCreateFlow,
  renewPermitFull,
  revisePermitFull,
} from "./create/flow";
// Navigation utilities
export {
  getCurrentPage,
  goToPage,
  isOnDustAppsPage,
} from "./create/navigation";
// Popup handling
export {
  clickNewApplicationButton,
  handleNewAppPopup,
  handleNewAppPopupFresh,
  handleReviseAppPopup,
} from "./create/popup";
