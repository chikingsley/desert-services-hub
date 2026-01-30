/**
 * Census Database Module
 *
 * Main entry point for the census database.
 */

// Import schema for side effects (creates tables)
import "./schema";

// Export the database connection
export { databasePath, db } from "./connection";
// Export all repository functions
export * from "./repositories";
// Export all types
export type {
  Account,
  AccountType,
  Attachment,
  ClassificationMethod,
  ClassificationStats,
  Email,
  EmailClassification,
  EmailEntity,
  EmailTask,
  Estimate,
  ExtractionStatus,
  InsertAttachmentData,
  InsertEmailData,
  InsertTaskData,
  Mailbox,
  Project,
  TaskPriority,
  TaskType,
  UpsertEstimateData,
} from "./types";
