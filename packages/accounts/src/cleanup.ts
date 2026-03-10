import {
  isLowSignalAccountName,
  isSyntheticEmailContactId,
  normalizeAccountName,
  repairAccountDomain,
} from "@accounts/hygiene";

export interface AccountCleanupRow {
  id: number;
  name: string;
  domain: string | null;
  mondayAccountId: string | null;
  mondayName: string | null;
  pdlEnrichedAt: string | null;
  pdlEnrichment: unknown;
  ssmAssignment: string | null;
  type: string | null;
  contactRefs: number;
  emailRefs: number;
  estimateRefs: number;
  projectRefs: number;
  dustPermitRefs: number;
  swpppRefs: number;
}

export interface AccountMergePlan {
  sourceId: number;
  sourceName: string;
  sourceDomain: string | null;
  sourceFootprint: number;
  targetDomain: string;
  targetId: number;
  targetName: string;
  targetFootprint: number;
  reason:
    | "low_signal_name_repaired_domain"
    | "same_monday_account_repaired_domain"
    | "same_name_repaired_domain";
  repairedDomain: string;
}

export interface ContactCleanupRow {
  id: number;
  mondayItemId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  priority: string | null;
  accountId: number | null;
  contractorMondayId: string | null;
  projectMondayIds: string | null;
  territoryOwner: string | null;
  importedAccountName: string | null;
  importedPhone: string | null;
  contractorMatched: string | null;
  phoneMatched: string | null;
  groupId: string | null;
  groupTitle: string | null;
  mobilePhone: string | null;
  officePhone: string | null;
  companyPhone: string | null;
  companyFax: string | null;
  contractorSearchedAt: string | null;
  contractorSearchNotes: string | null;
  syncedAt: string | null;
  emailLinkCount: number;
  estimateLinkCount: number;
}

export interface ContactMergePlan {
  email: string;
  reason: "synthetic_contact_upgraded_to_real";
  sourceAccountId: number | null;
  sourceId: number;
  sourceMondayItemId: string;
  targetAccountId: number | null;
  targetId: number;
  targetMondayItemId: string;
}

export interface ContactMergeSkippedGroup {
  count: number;
  email: string;
  realCount: number;
  reason: "multiple_real_contacts";
}

function normalizeDomain(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function getAccountFootprint(row: AccountCleanupRow): number {
  return (
    row.contactRefs +
    row.emailRefs +
    row.estimateRefs +
    row.projectRefs +
    row.dustPermitRefs +
    row.swpppRefs
  );
}

function getAccountMergeReason(
  source: AccountCleanupRow,
  target: AccountCleanupRow
): AccountMergePlan["reason"] | null {
  if (
    source.mondayAccountId &&
    target.mondayAccountId &&
    source.mondayAccountId === target.mondayAccountId
  ) {
    return "same_monday_account_repaired_domain";
  }

  if (normalizeAccountName(source.name) === normalizeAccountName(target.name)) {
    return "same_name_repaired_domain";
  }

  if (isLowSignalAccountName(source.name)) {
    return "low_signal_name_repaired_domain";
  }

  return null;
}

export function choosePreferredAccountName(
  currentName: string,
  incomingName: string
): string {
  const current = currentName.trim();
  const incoming = incomingName.trim();
  if (incoming.length === 0) {
    return current;
  }
  if (current.length === 0) {
    return incoming;
  }

  const currentLowSignal = isLowSignalAccountName(current);
  const incomingLowSignal = isLowSignalAccountName(incoming);

  if (currentLowSignal && !incomingLowSignal) {
    return incoming;
  }
  if (!currentLowSignal && incomingLowSignal) {
    return current;
  }
  if (incoming.length > current.length + 3) {
    return incoming;
  }
  return current;
}

export function planAccountMerges(
  rows: AccountCleanupRow[],
  options: { limit?: number } = {}
): AccountMergePlan[] {
  const byDomain = new Map<string, AccountCleanupRow>();
  for (const row of rows) {
    const normalizedDomain = normalizeDomain(row.domain);
    if (normalizedDomain) {
      byDomain.set(normalizedDomain, row);
    }
  }

  const plans: AccountMergePlan[] = [];
  for (const source of rows) {
    const normalizedSourceDomain = normalizeDomain(source.domain);
    if (!normalizedSourceDomain) {
      continue;
    }

    const repairedDomain = repairAccountDomain(normalizedSourceDomain);
    if (!repairedDomain || repairedDomain === normalizedSourceDomain) {
      continue;
    }

    const target = byDomain.get(repairedDomain);
    if (!target || target.id === source.id) {
      continue;
    }
    if (
      source.mondayAccountId &&
      target.mondayAccountId &&
      source.mondayAccountId !== target.mondayAccountId
    ) {
      continue;
    }

    const reason = getAccountMergeReason(source, target);
    if (!reason) {
      continue;
    }

    plans.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceDomain: source.domain,
      sourceFootprint: getAccountFootprint(source),
      targetDomain: repairedDomain,
      targetId: target.id,
      targetName: target.name,
      targetFootprint: getAccountFootprint(target),
      reason,
      repairedDomain,
    });
  }

  plans.sort((left, right) => {
    if (left.sourceFootprint !== right.sourceFootprint) {
      return right.sourceFootprint - left.sourceFootprint;
    }
    return left.sourceId - right.sourceId;
  });

  return options.limit ? plans.slice(0, options.limit) : plans;
}

export function planContactMerges(
  rows: ContactCleanupRow[],
  options: { limit?: number } = {}
): {
  merges: ContactMergePlan[];
  skippedGroups: ContactMergeSkippedGroup[];
} {
  const byEmail = new Map<string, ContactCleanupRow[]>();
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email) {
      continue;
    }
    const group = byEmail.get(email) ?? [];
    group.push(row);
    byEmail.set(email, group);
  }

  const merges: ContactMergePlan[] = [];
  const skippedGroups: ContactMergeSkippedGroup[] = [];

  for (const [email, group] of byEmail.entries()) {
    if (group.length < 2) {
      continue;
    }

    const realContacts = group.filter(
      (row) => !isSyntheticEmailContactId(row.mondayItemId)
    );
    if (realContacts.length !== 1) {
      skippedGroups.push({
        count: group.length,
        email,
        realCount: realContacts.length,
        reason: "multiple_real_contacts",
      });
      continue;
    }

    const target = realContacts[0]!;
    const sources = group.filter((row) => row.id !== target.id);
    for (const source of sources) {
      merges.push({
        email,
        reason: "synthetic_contact_upgraded_to_real",
        sourceAccountId: source.accountId,
        sourceId: source.id,
        sourceMondayItemId: source.mondayItemId,
        targetAccountId: target.accountId,
        targetId: target.id,
        targetMondayItemId: target.mondayItemId,
      });
    }
  }

  merges.sort((left, right) => {
    if (left.email !== right.email) {
      return left.email.localeCompare(right.email);
    }
    return left.sourceId - right.sourceId;
  });

  return {
    merges: options.limit ? merges.slice(0, options.limit) : merges,
    skippedGroups,
  };
}
