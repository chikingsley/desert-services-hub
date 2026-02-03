/**
 * Email Census Database
 *
 * Main entry point - re-exports all database operations.
 * This file maintains backward compatibility while the actual
 * implementation lives in db/repositories/.
 *
 * New code should import directly from "./db" or "./db/repositories".
 */

// Import schema for side effects (creates tables)
import "./db/schema";

// Re-export database connection
export { db } from "./db/connection";

// Re-export all repository functions
export {
  // Account
  addCompanyAlias,
  // Project
  addProjectAlias,
  // Statistics & Cleanup
  clearAllData,
  // Attachment
  clearAttachments,
  clearClassifications,
  clearProjectLinks,
  // Task
  clearTasks,
  createAccount,
  createProject,
  findProjectByText,
  getAccountByDomain,
  getAccountIdByAlias,
  getAliasesForProject,
  getAllAccounts,
  // Estimate
  getAllEstimates,
  // Mailbox
  getAllMailboxes,
  getAllProjects,
  getAttachmentById,
  getAttachmentStats,
  getAttachmentsForEmail,
  getClassificationDistribution,
  getDateRange,
  // Email
  getEmailById,
  getEmailByMessageId,
  getEmailCountByMailbox,
  getEmailsByClassification,
  getEmailsForAccount,
  getEmailsForProject,
  getEmailsWithAttachments,
  getEmailsWithoutProjectLink,
  getEmailsWithoutTasks,
  // Entity
  getEntitiesForEmail,
  getEstimateById,
  getEstimateByMondayId,
  getEstimateStats,
  getEstimatesWithoutFile,
  getLowConfidenceEmails,
  getMailbox,
  getOrCreateMailbox,
  getPendingAttachments,
  getProjectByAlias,
  getProjectById,
  getProjectsForAccount,
  getRecentEmails,
  getTasksForEmail,
  getTotalEmailCount,
  getUnclassifiedEmails,
  insertAttachment,
  insertEmail,
  insertEntity,
  insertTask,
  linkEmailToAccount,
  linkEmailToProject,
  searchAttachments,
  searchEmailsFullText,
  searchEstimates,
  updateAccountCounts,
  updateAttachmentExtraction,
  updateEmailClassification,
  updateEmailProjectLink,
  updateEstimateStorage,
  updateMailboxSyncState,
  updatePlansStorage,
  updateTaskStatus,
  upsertEstimate,
} from "./db/repositories";
