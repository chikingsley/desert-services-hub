const COMMON_BASE_TLDS = new Set([
  "com",
  "net",
  "org",
  "io",
  "co",
  "us",
  "biz",
  "info",
  "app",
  "dev",
  "ai",
  "gov",
  "edu",
  "mil",
  "me",
  "tv",
  "cc",
  "pro",
]);

const LOW_SIGNAL_NAMES = new Set([
  "contracts",
  "estimating",
  "construction accounting",
]);

const LOW_SIGNAL_PREFIXES = [
  "invitation to bid",
  "complete with docusign",
  "please sign",
];

function stripProtocolAndPath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

function isLikelyValidDomain(domain: string): boolean {
  if (domain.length < 4 || domain.length > 253) {
    return false;
  }
  if (!domain.includes(".")) {
    return false;
  }
  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return false;
  }
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }

  const labels = domain.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-")
    )
  ) {
    return false;
  }

  const tld = labels.at(-1) ?? "";
  return /^[a-z]{2,24}$/.test(tld);
}

function trimSuspiciousCompoundTld(domain: string): string | null {
  const labels = domain.split(".");
  const tld = labels.at(-1) ?? "";

  for (const base of COMMON_BASE_TLDS) {
    if (tld === base) {
      return domain;
    }
    if (tld.startsWith(base) && tld.length > base.length) {
      labels[labels.length - 1] = base;
      return labels.join(".");
    }
  }

  return null;
}

export function normalizeAccountName(name: string | null | undefined): string {
  return (
    name
      ?.toLowerCase()
      .replace(/&amp;/g, "&")
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

export function isLowSignalAccountName(
  name: string | null | undefined
): boolean {
  const normalized = normalizeAccountName(name);
  if (!normalized) {
    return true;
  }

  if (LOW_SIGNAL_NAMES.has(normalized)) {
    return true;
  }

  return LOW_SIGNAL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function repairAccountDomain(
  rawDomain: string | null | undefined
): string | null {
  if (!rawDomain) {
    return null;
  }

  const cleaned = stripProtocolAndPath(rawDomain);
  if (!cleaned) {
    return null;
  }

  const labels = cleaned.split(".").filter(Boolean);
  for (let end = 2; end <= labels.length; end++) {
    const prefix = labels.slice(0, end).join(".");
    if (isLikelyValidDomain(prefix) && COMMON_BASE_TLDS.has(labels[end - 1]!)) {
      return prefix;
    }

    const repairedPrefix = trimSuspiciousCompoundTld(prefix);
    if (repairedPrefix && isLikelyValidDomain(repairedPrefix)) {
      return repairedPrefix;
    }
  }

  const repaired = trimSuspiciousCompoundTld(cleaned);
  if (repaired && isLikelyValidDomain(repaired)) {
    return repaired;
  }

  return isLikelyValidDomain(cleaned) ? cleaned : null;
}

export function isSyntheticEmailContactId(mondayItemId: string): boolean {
  return mondayItemId.startsWith("email:");
}
