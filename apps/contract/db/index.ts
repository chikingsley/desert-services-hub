/**
 * Hub Database Module
 *
 * Main entry point for the hub database.
 */

// Import schema for side effects (creates tables)
import "@contract/db/schema";

// Export the database connection
export { databasePath, db } from "@contract/db/connection";
// Export all repository functions
export * from "@contract/db/repositories";
// Export all types
export type {
  Account,
  AccountType,
  Attachment,
  ClassificationMethod,
  ClassificationStats,
  Email,
  EmailClassification,
  Estimate,
  ExtractionStatus,
  InsertAttachmentData,
  InsertEmailData,
  Mailbox,
  Project,
  UpsertEstimateData,
} from "@contract/db/types";
