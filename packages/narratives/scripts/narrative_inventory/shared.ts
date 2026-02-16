/**
 * Shared types and utilities for narrative inventory scripts.
 *
 * Consolidated from duplicated code across build-source-packets, diff-narratives,
 * download-eva-to-jayson-attachments, inventory-swppp-variables,
 * report-packet-alignment, and report-variable-inventory.
 */
import { readFileSync } from "node:fs";

// ============================================================================
// Types
// ============================================================================

export interface Entry {
  docId: string;
  emailId: string;
  fileName: string;
  filePath: string;
  majorSection: string | null;
  subsection: string | null;
  block: string | null;
  key: string;
  value: string;
}

export interface DocMeta {
  emailId: string;
  fileName: string;
  filePath: string;
}

export interface CanonField {
  id: string;
  label: string;
  sources?: string[];
  derive?: (doc: Map<string, string>, allKeys: string[]) => string;
}

// ============================================================================
// Internal patterns (used by utility functions below)
// ============================================================================

const CITY_STATE_ZIP_PATTERN =
  /^\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/;
const ACRES_VALUE_PATTERN = /([0-9]+(?:\.[0-9]+)?)/;
const EMAIL_PATTERN = /\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b/;
const PHONE_PATTERN = /(\+?1[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/;

// ============================================================================
// String normalization
// ============================================================================

export function normalizeWhitespace(s: string): string {
  return s.replaceAll(/\s+/g, " ").trim();
}

export function normalizeValue(s: string): string {
  return normalizeWhitespace(s).toLowerCase();
}

/** Lowercase + strip non-alphanumeric + collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

// ============================================================================
// Formatting helpers
// ============================================================================

export function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function toTsvRow(cols: (string | number | null | undefined)[]): string {
  return cols
    .map((c) =>
      String(c ?? "")
        .replaceAll("\t", " ")
        .replaceAll("\n", " ")
    )
    .join("\t");
}

export function sanitizeFilename(name: string): string {
  return name.replaceAll("/", "_").replaceAll("\\", "_");
}

export function escapeODataStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

// ============================================================================
// Parsing helpers
// ============================================================================

export function tryParseCityStateZip(
  s: string
): { city: string; state: string; zip: string } | null {
  const m = CITY_STATE_ZIP_PATTERN.exec(s);
  if (!m) {
    return null;
  }
  const city = m[1]?.trim();
  const state = m[2];
  const zip = m[3];
  if (!(city && state && zip)) {
    return null;
  }
  return { city, state, zip };
}

export function tryParseAcres(s: string): number | null {
  const m = ACRES_VALUE_PATTERN.exec(s.replaceAll(",", ""));
  if (!m) {
    return null;
  }
  const rawValue = m[1];
  if (!rawValue) {
    return null;
  }
  const n = Number.parseFloat(rawValue);
  return Number.isFinite(n) ? n : null;
}

export function findFirstNonEmpty(
  doc: Map<string, string>,
  keys: string[]
): string {
  for (const k of keys) {
    const v = doc.get(k);
    if (v && v.trim() !== "") {
      return v;
    }
  }
  return "";
}

export function findEmailInValues(values: string[]): string {
  for (const v of values) {
    const m = EMAIL_PATTERN.exec(v);
    if (m?.[0]) {
      return m[0];
    }
  }
  return "";
}

export function findPhoneInValues(values: string[]): string {
  for (const v of values) {
    const m = PHONE_PATTERN.exec(v);
    if (m?.[0]) {
      return normalizeWhitespace(m[0]);
    }
  }
  return "";
}

export function parseTsv(path: string): { header: string[]; rows: string[][] } {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }
  const header = lines[0]?.split("\t");
  const rows = lines.slice(1).map((l) => l.split("\t"));
  return { header, rows };
}

// ============================================================================
// Canonical field evaluation
// ============================================================================

export function computeCanonicalValue(
  doc: Map<string, string>,
  allKeys: string[],
  field: CanonField
): string {
  if (field.derive) {
    return normalizeWhitespace(field.derive(doc, allKeys));
  }
  if (field.sources) {
    return normalizeWhitespace(findFirstNonEmpty(doc, field.sources));
  }
  return "";
}
