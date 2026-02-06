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
} from "@lib/db/repositories/account";
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
} from "@lib/db/repositories/attachment";
// Email
export {
  getEmailById,
  getEmailByMessageId,
  getEmailsByClassification,
  getEmailsWithAttachments,
  getEmailsWithoutProjectLink,
  getLinkedConversationSibling,
  getRecentEmails,
  getSenderProjectStats,
  getUnclassifiedEmails,
  insertEmail,
  parseEmailRow,
  updateEmailClassification,
  updateEmailProjectLink,
} from "@lib/db/repositories/email";
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
} from "@lib/db/repositories/estimate";
// Mailbox
export {
  getAllMailboxes,
  getMailbox,
  getOrCreateMailbox,
  updateMailboxSyncState,
} from "@lib/db/repositories/mailbox";
// Permit
export {
  getActivePermits,
  getPermitById,
  getPermitStats,
  getPermitsByAccount,
  getPermitsByProject,
  getPermitsByStatus,
  getRenewalChain,
  getUnlinkedPermits,
  linkPermitToAccount,
  linkPermitToProject,
  searchPermits,
  upsertPermit,
} from "@lib/db/repositories/permit";
// Project
export {
  addProjectAlias,
  createProject,
  findProjectByText,
  getAliasesForProject,
  getAllProjectNames,
  getAllProjects,
  getEmailsForAccount,
  getEmailsForProject,
  getProjectByAlias,
  getProjectById,
  getProjectsForAccount,
  linkEmailToProject,
} from "@lib/db/repositories/project";

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
} from "@lib/db/repositories/stats";
