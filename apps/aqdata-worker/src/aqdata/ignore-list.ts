const SPLIT_PERMIT_IDS_REGEX = /[\s,;]+/;

function normalizePermitId(value: string): string {
  return value.trim().toUpperCase();
}

function parseIgnoredPermitIds(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  const permitIds = raw
    .split(SPLIT_PERMIT_IDS_REGEX)
    .map(normalizePermitId)
    .filter(Boolean);

  return new Set(permitIds);
}

const IGNORED_PERMIT_IDS = parseIgnoredPermitIds(
  process.env.AQDATA_IGNORE_PERMIT_IDS
);

export function getIgnoredPermitIds(): readonly string[] {
  return [...IGNORED_PERMIT_IDS];
}

export function isPermitIgnored(permitId: string): boolean {
  return IGNORED_PERMIT_IDS.has(normalizePermitId(permitId));
}
