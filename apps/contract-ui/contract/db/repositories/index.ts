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
} from "@contract/db/repositories/account";
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
} from "@contract/db/repositories/attachment";
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
} from "@contract/db/repositories/email";
// Entity - REMOVED (unused)
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
} from "@contract/db/repositories/estimate";
// Mailbox
export {
  getAllMailboxes,
  getMailbox,
  getOrCreateMailbox,
  updateMailboxSyncState,
} from "@contract/db/repositories/mailbox";
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
} from "@contract/db/repositories/project";

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
} from "@contract/db/repositories/stats";
// Task - REMOVED (unused)
