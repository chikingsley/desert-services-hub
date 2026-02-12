/**
 * Shared project matching text utilities.
 *
 * Keep all project-name normalization and token-overlap behavior in one place
 * so folder watcher, dust-permit intake, and SWPPP reconciliation use the
 * same rules.
 */

const NON_WORD_KEEP_SPACE_RE = /[^\w\s]/g;
const MULTI_SPACE_RE = /\s+/g;
const HAS_DIGIT_RE = /\d/;

const DEFAULT_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "this",
  "that",
  "desert",
  "services",
  "project",
  "job",
  "site",
  "swppp",
  "subcontract",
  "agreement",
  "contract",
  "permit",
  "dust",
  "noi",
  "notice",
  "intent",
  "phase",
  "llc",
  "inc",
  "co",
]);

export function normalizeProjectAlias(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(NON_WORD_KEEP_SPACE_RE, " ")
    .replace(MULTI_SPACE_RE, " ")
    .trim();
}

export function normalizeProjectNameKey(text: string): string {
  return normalizeProjectAlias(text).replace(MULTI_SPACE_RE, "");
}

export function tokenizeProjectText(
  text: string,
  opts?: { stopWords?: Set<string>; minLen?: number }
): Set<string> {
  const stopWords = opts?.stopWords ?? DEFAULT_STOP_WORDS;
  const minLen = Math.max(2, opts?.minLen ?? 3);
  const normalized = normalizeProjectAlias(text);
  if (!normalized) {
    return new Set<string>();
  }

  const out = new Set<string>();
  for (const token of normalized.split(MULTI_SPACE_RE)) {
    if (!token) {
      continue;
    }
    if (token.length < minLen && !HAS_DIGIT_RE.test(token)) {
      continue;
    }
    if (stopWords.has(token)) {
      continue;
    }
    out.add(token);
  }
  return out;
}

export function tokenOverlap(
  lhs: Set<string>,
  rhs: Set<string>
): { common: string[]; ratio: number } {
  if (lhs.size === 0 || rhs.size === 0) {
    return { common: [], ratio: 0 };
  }

  const common: string[] = [];
  for (const token of lhs) {
    if (rhs.has(token)) {
      common.push(token);
    }
  }
  if (common.length === 0) {
    return { common, ratio: 0 };
  }

  const minSize = Math.max(1, Math.min(lhs.size, rhs.size));
  return { common, ratio: common.length / minSize };
}

export function uniqueStrings(
  values: Array<string | null | undefined>
): string[] {
  const dedup = new Set<string>();
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed.length === 0) {
      continue;
    }
    dedup.add(trimmed);
  }
  return [...dedup];
}
