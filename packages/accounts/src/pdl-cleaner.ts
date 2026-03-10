import {
  isLowSignalAccountName,
  repairAccountDomain,
} from "@accounts/hygiene";

const IGNORED_WEBSITES = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
  "buildingconnected.com",
  "procore.com",
  "procoretech.com",
  "us02.procoretech.com",
  "bbbid.thebluebook.com",
  "thebluebook.com",
  "bidmail.com",
  "pype.io",
  "planhub.com",
  "message.planhub.com",
  "smartbidnet.com",
  "com2.smartbidnet.com",
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "avanan-mail.net",
]);

export interface AccountPdlCandidateRow {
  domain: string | null;
  id: number;
  mondayAccountId: string | null;
  name: string;
  pdlEnrichedAt: string | null;
}

export interface CompanyCleanerInput {
  name?: string;
  website?: string;
}

export type PdlCleanerDecision =
  | {
      reason:
        | "already-enriched"
        | "monday-backed"
        | "no-usable-identifier";
      shouldAttempt: false;
    }
  | {
      input: CompanyCleanerInput;
      repairedDomain: string | null;
      shouldAttempt: true;
    };

function normalizeWebsiteCandidate(
  domain: string | null | undefined
): string | null {
  const repaired = repairAccountDomain(domain);
  if (!repaired || IGNORED_WEBSITES.has(repaired)) {
    return null;
  }
  return repaired;
}

export function buildCompanyCleanerInput(
  row: Pick<AccountPdlCandidateRow, "domain" | "name">
): { input: CompanyCleanerInput; repairedDomain: string | null } | null {
  const website = normalizeWebsiteCandidate(row.domain);
  const trimmedName = row.name.trim();
  const usableName =
    trimmedName.length > 0 && !isLowSignalAccountName(trimmedName)
      ? trimmedName
      : null;

  if (!website && !usableName) {
    return null;
  }

  return {
    input: {
      ...(usableName ? { name: usableName } : {}),
      ...(website ? { website } : {}),
    },
    repairedDomain: website,
  };
}

export function shouldAttemptPdlCompanyCleaner(
  row: AccountPdlCandidateRow,
  options: { force?: boolean } = {}
): PdlCleanerDecision {
  const force = options.force === true;
  if (!force && row.mondayAccountId) {
    return { reason: "monday-backed", shouldAttempt: false };
  }
  if (!force && row.pdlEnrichedAt) {
    return { reason: "already-enriched", shouldAttempt: false };
  }

  const built = buildCompanyCleanerInput(row);
  if (!built) {
    return { reason: "no-usable-identifier", shouldAttempt: false };
  }

  return {
    input: built.input,
    repairedDomain: built.repairedDomain,
    shouldAttempt: true,
  };
}
