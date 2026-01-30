/**
 * Database Repositories
 *
 * Re-exports all repository functions for easy importing.
 */

// Account
export {
  addCompanyAlias,
  createAccount,
  getAccountByDomain,
  getAccountIdByAlias,
  getAllAccounts,
  linkEmailToAccount,
  updateAccountCounts,
} from "./account";
// Attachment
export {
  clearAttachments,
  getAttachmentById,
  getAttachmentStats,
  getAttachmentsForEmail,
  getPendingAttachments,
  insertAttachment,
  searchAttachments,
  searchEmailsFullText,
  updateAttachmentExtraction,
} from "./attachment";
// Email
export {
  getEmailById,
  getEmailByMessageId,
  getEmailsByClassification,
  getEmailsWithAttachments,
  getEmailsWithoutProjectLink,
  getRecentEmails,
  getUnclassifiedEmails,
  insertEmail,
  parseEmailRow,
  updateEmailClassification,
  updateEmailProjectLink,
} from "./email";
// Entity
export { getEntitiesForEmail, insertEntity } from "./entity";
// Estimate
export {
  getAllEstimates,
  getEstimateById,
  getEstimateByMondayId,
  getEstimateStats,
  getEstimatesWithoutFile,
  searchEstimates,
  updateEstimateStorage,
  updatePlansStorage,
  upsertEstimate,
} from "./estimate";
// Mailbox
export {
  getAllMailboxes,
  getMailbox,
  getOrCreateMailbox,
  updateMailboxSyncState,
} from "./mailbox";
// Project
export {
  addProjectAlias,
  createProject,
  findProjectByText,
  getAliasesForProject,
  getAllProjects,
  getEmailsForAccount,
  getEmailsForProject,
  getProjectByAlias,
  getProjectById,
  getProjectsForAccount,
  linkEmailToProject,
} from "./project";

// Statistics & Cleanup
export {
  clearAllData,
  clearClassifications,
  clearProjectLinks,
  getClassificationDistribution,
  getDateRange,
  getEmailCountByMailbox,
  getLowConfidenceEmails,
  getTotalEmailCount,
} from "./stats";
// Task
export {
  clearTasks,
  getEmailsWithoutTasks,
  getTasksForEmail,
  insertTask,
  updateTaskStatus,
} from "./task";
