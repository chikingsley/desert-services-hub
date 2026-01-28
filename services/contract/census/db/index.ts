/**
 * Census Database Module
 *
 * Re-exports all database types, connection, and operations.
 * This is the main entry point for the census database.
 */

// Export the database connection
export { databasePath, db } from "./connection";

// Export all types
export type {
  // Entity interfaces
  Account,
  AccountType,
  Attachment,
  ClassificationMethod,
  // Statistics types
  ClassificationStats,
  Email,
  // Classification types
  EmailClassification,
  EmailEntity,
  EmailTask,
  Estimate,
  ExtractionStatus,
  InsertAttachmentData,
  // Input data types
  InsertEmailData,
  InsertTaskData,
  Mailbox,
  Project,
  TaskPriority,
  TaskType,
  UpsertEstimateData,
} from "./types";
