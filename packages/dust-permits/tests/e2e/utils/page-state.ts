/**
 * Page State Verification Utilities
 *
 * Barrel export for all page state verification functions.
 * These functions check the current state of form fields on various pages
 * to verify that fields have been filled correctly. Used exclusively in E2E tests
 * for assertions and debugging.
 *
 * Note: Selectors are imported and passed to `page.evaluate()` because the browser
 * context cannot access Node.js imports directly. This is the correct pattern.
 */

export { getPage1State } from "./page1-state";
export { getPage3State } from "./page3-state";
export { getPage4State } from "./page4-state";
export { getPage5State } from "./page5-state";
