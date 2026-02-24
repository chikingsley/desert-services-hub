import type { Email } from "@lib/db/types";

export interface EmailStats {
  contracts: number;
  docusign: number;
  dustPermits: number;
  estimates: number;
  excluded: number;
  hr: number;
  internal: number;
  invoices: number;
  it: number;
  payments: number;
  total: number;
  withAttachments: number;
}

export interface Pagination {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export type EmailWithDedup = Email & { recipientCount: number };

export interface EmailsApiResponse {
  emails: EmailWithDedup[];
  pagination: Pagination;
  stats: EmailStats;
}

export interface SenderOption {
  count: number;
  displayName: string;
  email: string;
}

// Tab config — each tab maps to a query param strategy
export const FILTER_TABS = [
  { value: "inbox", label: "Inbox" },
  { value: "all", label: "All" },
  { value: "CONTRACT", label: "Contract" },
  { value: "ESTIMATE", label: "Estimate" },
  { value: "DUST_PERMIT", label: "Dust Permit" },
  { value: "PAYMENT", label: "Payment" },
  { value: "HR", label: "HR" },
  { value: "IT", label: "IT" },
  { value: "spam", label: "Spam" },
] as const;

export const CLASSIFICATION_COLORS: Record<string, string> = {
  CONTRACT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  DUST_PERMIT:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  INVOICE:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  ESTIMATE:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  INSURANCE:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  INTERNAL: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
  SCHEDULE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  CHANGE_ORDER: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  VENDOR: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  SWPPP: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  PAYMENT:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  HR: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  IT: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  SPAM: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/20 dark:text-zinc-500",
  UNKNOWN: "bg-muted text-muted-foreground",
};

// Categories available for domain-level classification
export const CLASSIFY_OPTIONS = [
  { value: "ESTIMATE", label: "Estimate" },
  { value: "CONTRACT", label: "Contract" },
  { value: "DUST_PERMIT", label: "Dust Permit" },
  { value: "PAYMENT", label: "Payment" },
  { value: "HR", label: "HR" },
  { value: "IT", label: "IT" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "SCHEDULE", label: "Schedule" },
  { value: "VENDOR", label: "Vendor" },
] as const;

export const EMPTY_STATS: EmailStats = {
  total: 0,
  estimates: 0,
  contracts: 0,
  dustPermits: 0,
  invoices: 0,
  payments: 0,
  hr: 0,
  it: 0,
  internal: 0,
  docusign: 0,
  withAttachments: 0,
  excluded: 0,
};

export function buildApiUrl(
  page: number,
  search: string,
  filterTab: string,
  senderEmails: string[],
  hasAttachmentsOnly: boolean
): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "50");

  if (search.trim()) {
    params.set("search", search.trim());
  }

  if (filterTab === "inbox") {
    // Actionable default: hide noisy categories but keep dedicated tabs for them.
    params.set("exclude_classifications", "HR,IT");
  } else if (filterTab === "spam") {
    params.set("only_excluded", "1");
  } else if (filterTab !== "all") {
    params.set("classification", filterTab);
  }

  if (senderEmails.length > 0) {
    params.set("senders", senderEmails.join(","));
  }

  if (hasAttachmentsOnly) {
    params.set("has_attachments", "1");
  }

  return `/api/emails?${params.toString()}`;
}

export function buildStatForTab(stats: EmailStats): Record<string, number> {
  return {
    inbox: Math.max(0, stats.total - stats.hr - stats.it),
    ESTIMATE: stats.estimates,
    CONTRACT: stats.contracts,
    DUST_PERMIT: stats.dustPermits,
    PAYMENT: stats.payments,
    HR: stats.hr,
    IT: stats.it,
    spam: stats.excluded,
  };
}
