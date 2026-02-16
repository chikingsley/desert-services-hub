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
export type {
  ProjectMatchCandidate,
  ProjectMatchContext,
  ProjectMatchDecision,
  ProjectMatchInput,
  ProjectMatchReason,
  ProjectMatchReasonCode,
  ProjectMatchResult,
} from "@lib/db/repositories/project";
// Project
export {
  addProjectAlias,
  createProject,
  findBestProjectMatch,
  findProjectByText,
  findProjectCandidates,
  getAliasesForProject,
  getAllProjectNames,
  getAllProjects,
  getEmailsForAccount,
  getEmailsForProject,
  getProjectByAlias,
  getProjectById,
  getProjectsForAccount,
  linkEmailToProject,
  normalizeProjectAlias,
  normalizeProjectNameKey,
  tokenizeProjectText,
  tokenOverlap,
  uniqueStrings,
} from "@lib/db/repositories/project";
// Project ↔ Estimate
export {
  getCanonicalEstimateForProject,
  getCanonicalProjectSov,
  getEstimatesForProject,
  linkEstimateToProject,
  setCanonicalEstimateForProject,
} from "@lib/db/repositories/project-estimate";
export type { ProjectMatchReviewSource } from "@lib/db/repositories/project-match-review";
// Project Match Review Queue
export {
  getProjectMatchReview,
  resolveProjectMatchReview,
  upsertProjectMatchReview,
} from "@lib/db/repositories/project-match-review";
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
export type {
  ProjectMatchReview,
  ProjectMatchReviewStatus,
} from "@lib/db/types";
