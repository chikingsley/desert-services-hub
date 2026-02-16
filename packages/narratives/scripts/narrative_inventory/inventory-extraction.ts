import { createHash } from "node:crypto";

import type { Entry } from "./shared";
import { normalizeWhitespace } from "./shared";

// --- Types ---

export interface DocFile {
  emailId: string;
  fileName: string;
  filePath: string;
}

interface ExtractState {
  majorSection: string | null;
  subsection: string | null;
  block: string | null;
  blockLineIndex: number;
  inContactBlock: boolean;
  seenProjectSiteInfoWithValues: boolean;
}

// --- Patterns ---

const MAJOR_SECTION_PATTERN = /^SECTION\s+(\d+):\s*(.+)$/i;
const SUBSECTION_PATTERN = /^(\d+(?:\.\d+)+)\t+(.+)$/;
const CONTENTS_PATTERN = /^contents$/i;
const COORDINATE_PLACEHOLDER_PATTERN = /^[NSEW]\s*\(decimal\)$/i;
const HAS_DIGIT_PATTERN = /\d/;
const KNOWN_PLACEHOLDER_VALUE_PATTERN =
  /^(n\/a|na|not applicable\.?|tbd|to be determined)$/i;
const BMP_DESCRIPTION_KEY_PATTERN =
  /^BMP\s+([A-Z]{1,5}-?\d{1,4})\s+Description$/i;

const NOISE_LINE_PREFIXES = ["PAGEREF ", "HYPERLINK ", "TOC \\", "PK"];

const NOISE_LINE_CONTAINS = [
  "schemas.openxmlformats.org",
  "http://schemas",
  "[Content_Types].xml",
  "xmlns:",
  "<xsd:",
  "</xsd:",
  "<ds:",
  "</ds:",
  "<dc:",
  "</dc:",
  "<dcterms:",
  "</dcterms:",
  "<cp:",
  "</cp:",
];

const BLOCK_START_KEYS = new Set([
  "Operator(s)",
  "Project Manager",
  "SWPPP Contact(s)",
  "Emergency 24-Hour Contact",
  "This SWPPP AZ Prepared by",
]);

const NUMERIC_VALUE_KEYS = new Set([
  "SWPPP Preparation Date",
  "Total project area",
  "Construction site area to be disturbed",
  "Percentage impervious area before construction",
  "Runoff coefficient before construction",
  "Percentage impervious area after construction",
  "Runoff coefficient after construction",
  "Latitude",
  "Longitude",
]);

const FREE_TEXT_KEYS = new Set([
  "Installation Schedule",
  "Maintenance and Inspection",
  "Responsible Staff",
]);

const TAKE_NEXT_LINE_AS_VALUE_KEYS = new Set([
  ...NUMERIC_VALUE_KEYS,
  ...FREE_TEXT_KEYS,
]);

export function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  if (
    trimmed === "Contents" ||
    trimmed === "FORMCHECKBOX" ||
    trimmed === "FORMTEXT"
  ) {
    return true;
  }
  if (trimmed.startsWith("<")) {
    return true;
  }
  return (
    NOISE_LINE_PREFIXES.some((p) => trimmed.startsWith(p)) ||
    NOISE_LINE_CONTAINS.some((c) => trimmed.includes(c))
  );
}

export function parseMajorSectionHeading(line: string): string | null {
  const m = MAJOR_SECTION_PATTERN.exec(line);
  if (!m) {
    return null;
  }
  return `SECTION ${m[1]}: ${normalizeWhitespace(m[2] ?? "")}`.trim();
}

export function parseSubsectionHeading(line: string): string | null {
  const m = SUBSECTION_PATTERN.exec(line);
  if (!m) {
    return null;
  }
  return `${m[1]} ${normalizeWhitespace(m[2] ?? "")}`.trim();
}

export function splitKeyValue(
  line: string
): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes("://")) {
    return null;
  }
  const idx = trimmed.indexOf(":");
  if (idx <= 0) {
    return null;
  }
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  if (!key || key.length > 80) {
    return null;
  }
  return { key, value };
}

function buildScopedKey(
  majorSection: string | null,
  subsection: string | null,
  block: string | null,
  keyNorm: string
): string {
  const parts: string[] = [];
  if (subsection) {
    parts.push(subsection);
  } else if (majorSection) {
    parts.push(majorSection);
  } else {
    parts.push("TITLE");
  }
  if (block) {
    parts.push(block);
  }
  parts.push(keyNorm);
  return parts.join(".");
}

// --- Contact block line handling ---

function tryHandleContactBlockLine(params: {
  line: string;
  block: string;
  blockLineIndex: number;
  majorSection: string | null;
  subsection: string | null;
  docId: string;
  doc: DocFile;
}): { entry: Entry; newBlockLineIndex: number } | null {
  if (isNoiseLine(params.line) || params.line.length > 120) {
    return null;
  }
  if (
    parseMajorSectionHeading(params.line) ||
    parseSubsectionHeading(params.line)
  ) {
    return null;
  }
  if (splitKeyValue(params.line) !== null) {
    return null;
  }
  const keyNorm = `Line${params.blockLineIndex + 1}`;
  const valueNorm = normalizeWhitespace(params.line);
  if (valueNorm === "") {
    return null;
  }
  return {
    entry: {
      block: params.block,
      docId: params.docId,
      emailId: params.doc.emailId,
      fileName: params.doc.fileName,
      filePath: params.doc.filePath,
      key: buildScopedKey(
        params.majorSection,
        params.subsection,
        params.block,
        keyNorm
      ),
      majorSection: params.majorSection,
      subsection: params.subsection,
      value: valueNorm,
    },
    newBlockLineIndex: params.blockLineIndex + 1,
  };
}

function tryResolveNextLineValue(
  lines: string[],
  index: number,
  keyNorm: string
): { value: string; consumed: boolean } {
  if (!TAKE_NEXT_LINE_AS_VALUE_KEYS.has(keyNorm)) {
    return { consumed: false, value: "" };
  }
  const next = lines[index + 1];
  if (!next || isNoiseLine(next)) {
    return { consumed: false, value: "" };
  }
  const nextIsHeading =
    Boolean(parseMajorSectionHeading(next)) ||
    Boolean(parseSubsectionHeading(next));
  if (nextIsHeading || splitKeyValue(next) !== null || next.length > 120) {
    return { consumed: false, value: "" };
  }
  const s = normalizeWhitespace(next);
  if (!s || CONTENTS_PATTERN.test(s) || s.endsWith(":")) {
    return { consumed: false, value: "" };
  }
  if (COORDINATE_PLACEHOLDER_PATTERN.test(s)) {
    return { consumed: false, value: "" };
  }
  if (NUMERIC_VALUE_KEYS.has(keyNorm)) {
    return HAS_DIGIT_PATTERN.test(s)
      ? { consumed: true, value: s }
      : { consumed: false, value: "" };
  }
  if (FREE_TEXT_KEYS.has(keyNorm)) {
    return { consumed: true, value: s };
  }
  if (HAS_DIGIT_PATTERN.test(s) || KNOWN_PLACEHOLDER_VALUE_PATTERN.test(s)) {
    return { consumed: true, value: s };
  }
  return { consumed: false, value: "" };
}

// --- Unlabeled 1.1 project info recovery ---

function collectRawLinesAfterHeader(
  lines: string[],
  startIndex: number,
  maxCount: number
): string[] {
  const result: string[] = [];
  for (let j = startIndex; j < lines.length && result.length < maxCount; j++) {
    const l = lines[j];
    if (!l) {
      break;
    }
    if (parseMajorSectionHeading(l) || parseSubsectionHeading(l)) {
      break;
    }
    if (splitKeyValue(l)) {
      break;
    }
    if (isNoiseLine(l) || l.length > 120) {
      continue;
    }
    result.push(normalizeWhitespace(l));
  }
  return result;
}

function findPrecedingMajorSection(
  lines: string[],
  index: number
): string | null {
  for (let k = index; k >= 0; k--) {
    const m = parseMajorSectionHeading(lines[k] ?? "");
    if (m) {
      return m;
    }
  }
  return null;
}

function recoverUnlabeledProjectInfo(params: {
  lines: string[];
  docId: string;
  doc: DocFile;
}): Entry[] {
  const entries: Entry[] = [];
  for (let i = 0; i < params.lines.length; i++) {
    const sub = parseSubsectionHeading(params.lines[i] ?? "");
    if (!sub?.startsWith("1.1")) {
      continue;
    }
    if (!sub.toLowerCase().includes("project/site information")) {
      continue;
    }
    const rawAfter = collectRawLinesAfterHeader(params.lines, i + 1, 5);
    if (rawAfter.length < 2) {
      continue;
    }
    const majorForUnlabeled = findPrecedingMajorSection(params.lines, i);
    const base = "1.1 Project/Site Information.UNLABELED";
    const add = (k: string, v: string) => {
      entries.push({
        block: null,
        docId: params.docId,
        emailId: params.doc.emailId,
        fileName: params.doc.fileName,
        filePath: params.doc.filePath,
        key: `${base}.${k}`,
        majorSection: majorForUnlabeled,
        subsection: sub,
        value: v,
      });
    };
    add("project_name", rawAfter[0] ?? "");
    add("address_line1", rawAfter[1] ?? "");
    if (rawAfter[2]) {
      add("address_line2", rawAfter[2]);
    }
    break;
  }
  return entries;
}

function processKeyValue(params: {
  kv: { key: string; value: string };
  state: ExtractState;
  lines: string[];
  lineIndex: number;
  docId: string;
  doc: DocFile;
}): { entry: Entry | null; consumed: boolean } {
  const { kv, state } = params;
  const keyNorm = normalizeWhitespace(kv.key);
  let valueNorm = normalizeWhitespace(kv.value);

  if (valueNorm === "" && BLOCK_START_KEYS.has(keyNorm)) {
    state.block = keyNorm;
    state.blockLineIndex = 0;
    state.inContactBlock =
      !(state.majorSection || state.subsection) ||
      Boolean(state.subsection?.startsWith("1.2"));
    return { consumed: false, entry: null };
  }

  if (valueNorm !== "") {
    const bmpMatch = BMP_DESCRIPTION_KEY_PATTERN.exec(keyNorm);
    if (bmpMatch?.[1]) {
      state.block = `BMP ${bmpMatch[1].toUpperCase()}`;
      state.blockLineIndex = 0;
      state.inContactBlock = false;
    }
  }

  let consumed = false;
  if (valueNorm === "") {
    const resolved = tryResolveNextLineValue(
      params.lines,
      params.lineIndex,
      keyNorm
    );
    if (resolved.consumed) {
      valueNorm = resolved.value;
      consumed = true;
    }
  }

  if (
    state.subsection?.includes("1.1") &&
    state.subsection.toLowerCase().includes("project/site information") &&
    valueNorm !== ""
  ) {
    state.seenProjectSiteInfoWithValues = true;
  }

  const scopedKey = buildScopedKey(
    state.majorSection,
    state.subsection,
    state.block,
    keyNorm
  );
  const keepEmpty =
    (state.majorSection?.startsWith("SECTION 1") ?? false) ||
    (state.subsection?.startsWith("1.") ?? false) ||
    !state.seenProjectSiteInfoWithValues;

  if (valueNorm === "" && !keepEmpty) {
    return { consumed, entry: null };
  }

  return {
    consumed,
    entry: {
      block: state.block,
      docId: params.docId,
      emailId: params.doc.emailId,
      fileName: params.doc.fileName,
      filePath: params.doc.filePath,
      key: scopedKey,
      majorSection: state.majorSection,
      subsection: state.subsection,
      value: valueNorm,
    },
  };
}

// --- Main extraction ---

export function extractEntriesFromLines(params: {
  doc: DocFile;
  lines: string[];
}): Entry[] {
  const entries: Entry[] = [];
  const hash = createHash("sha1")
    .update(params.doc.fileName)
    .digest("hex")
    .slice(0, 10);
  const docId = `${params.doc.emailId}:${hash}:${params.doc.fileName}`;
  const state: ExtractState = {
    block: null,
    blockLineIndex: 0,
    inContactBlock: false,
    majorSection: null,
    seenProjectSiteInfoWithValues: false,
    subsection: null,
  };

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i];
    const major = parseMajorSectionHeading(line);
    if (major) {
      state.majorSection = major;
      state.subsection = null;
      state.block = null;
      state.blockLineIndex = 0;
      state.inContactBlock = false;
      continue;
    }
    const sub = parseSubsectionHeading(line);
    if (sub) {
      state.subsection = sub;
      state.block = null;
      state.blockLineIndex = 0;
      state.inContactBlock = false;
      continue;
    }
    if (state.block && state.inContactBlock) {
      const contactResult = tryHandleContactBlockLine({
        block: state.block,
        blockLineIndex: state.blockLineIndex,
        doc: params.doc,
        docId,
        line,
        majorSection: state.majorSection,
        subsection: state.subsection,
      });
      if (contactResult) {
        entries.push(contactResult.entry);
        state.blockLineIndex = contactResult.newBlockLineIndex;
        continue;
      }
    }
    const kv = splitKeyValue(line);
    if (!kv) {
      continue;
    }
    const result = processKeyValue({
      doc: params.doc,
      docId,
      kv,
      lineIndex: i,
      lines: params.lines,
      state,
    });
    if (result.entry) {
      entries.push(result.entry);
    }
    if (result.consumed) {
      i++;
    }
  }

  entries.push(
    ...recoverUnlabeledProjectInfo({
      doc: params.doc,
      docId,
      lines: params.lines,
    })
  );
  return entries;
}
