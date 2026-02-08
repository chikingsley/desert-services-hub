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
// Dust Permit (filed by Desert Services)
export {
  deleteRecentPermits,
  getActivePermits,
  getExpiringPermits,
  getPermitById,
  getPermitCount,
  getPermitStats,
  getPermitsByAccount,
  getPermitsByPortalCompany,
  getPermitsByProject,
  getPermitsByStatus,
  getPermitsNeedingScrape,
  getRenewalChain,
  getUnlinkedPermits,
  linkPermitToAccount,
  linkPermitToProject,
  markPermitScraped,
  permitExists,
  searchPermits,
  upsertPermit,
} from "@lib/db/repositories/dust-permit";
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
// Marketing Permit (all Maricopa County permits)
export {
  getActivePermitsByCompany,
  getMarketingPermit,
  getMarketingPermitCount,
  getMarketingPermits,
  getPermitsNeedingDetailScrape,
  markDetailScraped,
  upsertMarketingPermit,
} from "@lib/db/repositories/marketing-permit";
// NOI
export {
  getAllNOIs,
  getNOIByPermitId,
  getNOIByProject,
  insertNOI,
} from "@lib/db/repositories/noi";
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
