/**
 * Inventory variables in Eva->Jayson SWPPP narrative Word docs.
 *
 * Goal: produce a "360" view of what changes from doc to doc by extracting
 * key/value-ish lines from the Word binary using `strings`, then aggregating.
 *
 * Why `strings`:
 * - These are legacy `.doc` (Compound File) Word documents.
 * - We don't assume antiword/libreoffice is installed.
 * - `strings` is available and reliably exposes the human text content.
 *
 * Outputs (under --out):
 * - entries.jsonl: one JSON object per extracted field occurrence
 * - keys.tsv: aggregated field keys with unique value counts + samples
 * - docs.tsv: per-document "core" fields (project, address, operator, dates, etc.)
 *
 * Usage:
 *   bun packages/narratives/scripts/inventory-swppp-variables.ts
 *   bun packages/narratives/scripts/inventory-swppp-variables.ts --in packages/narratives/data/intake/eva-to-jayson/by-email --out packages/narratives/data/intake/eva-to-jayson/variable-inventory
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";

interface DocFile {
  emailId: string;
  fileName: string;
  filePath: string;
}

interface Entry {
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

const WORD_EXTS = new Set([".doc", ".docx", ".docm"]);

const STRINGS_MIN_LEN_DEFAULT = 8;
const MAJOR_SECTION_PATTERN = /^SECTION\s+(\d+):\s*(.+)$/i;
const SUBSECTION_PATTERN = /^(\d+(?:\.\d+)+)\t+(.+)$/;
const CONTENTS_PATTERN = /^contents$/i;
const COORDINATE_PLACEHOLDER_PATTERN = /^[NSEW]\s*\(decimal\)$/i;
const HAS_DIGIT_PATTERN = /\d/;
const KNOWN_PLACEHOLDER_VALUE_PATTERN =
  /^(n\/a|na|not applicable\.?|tbd|to be determined)$/i;
const BMP_DESCRIPTION_KEY_PATTERN =
  /^BMP\s+([A-Z]{1,5}-?\d{1,4})\s+Description$/i;

const NOISE_LINE_PREFIXES = [
  "PAGEREF ",
  "HYPERLINK ",
  "TOC \\",
  "PK", // zip marker often appears in embedded parts
];

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

function normalizeWhitespace(s: string): string {
  return s.replaceAll(/\s+/g, " ").trim();
}

function normalizeKey(s: string): string {
  // Keep asterisks and parentheses as-is; just normalize whitespace.
  return normalizeWhitespace(s);
}

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed === "Contents") {
    return true; // TOC header; not meaningful content for extraction
  }
  if (trimmed === "FORMCHECKBOX") {
    return true;
  }
  if (trimmed === "FORMTEXT") {
    return true;
  }
  if (trimmed.startsWith("<")) {
    return true;
  }
  for (const p of NOISE_LINE_PREFIXES) {
    if (trimmed.startsWith(p)) {
      return true;
    }
  }
  for (const c of NOISE_LINE_CONTAINS) {
    if (trimmed.includes(c)) {
      return true;
    }
  }
  return false;
}

function sha1Short(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 10);
}

function listWordDocs(byEmailDir: string): DocFile[] {
  const result: DocFile[] = [];
  if (!existsSync(byEmailDir)) {
    throw new Error(`Input directory not found: ${byEmailDir}`);
  }

  for (const emailId of readdirSync(byEmailDir)) {
    const dir = join(byEmailDir, emailId);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) {
      continue;
    }

    for (const name of readdirSync(dir)) {
      const ext = extname(name).toLowerCase();
      if (!WORD_EXTS.has(ext)) {
        continue;
      }
      const filePath = join(dir, name);
      result.push({ emailId, fileName: name, filePath });
    }
  }

  // Stable ordering for reproducible outputs.
  result.sort((a, b) => {
    const ea = Number.parseInt(a.emailId, 10);
    const eb = Number.parseInt(b.emailId, 10);
    if (!(Number.isNaN(ea) || Number.isNaN(eb)) && ea !== eb) {
      return ea - eb;
    }
    if (a.emailId !== b.emailId) {
      return a.emailId.localeCompare(b.emailId);
    }
    return a.fileName.localeCompare(b.fileName);
  });

  return result;
}

function runStrings(filePath: string, minLen: number): string[] {
  const proc = Bun.spawnSync({
    cmd: ["strings", "-n", String(minLen), filePath],
    stderr: "pipe",
    stdout: "pipe",
  });

  if (proc.exitCode !== 0) {
    const err = proc.stderr.toString("utf8").slice(0, 2000);
    throw new Error(
      `strings failed (exit=${proc.exitCode}) for ${filePath}: ${err}`
    );
  }

  return proc.stdout
    .toString("utf8")
    .split("\n")
    .map((l) => l.replaceAll(/\r/g, "").trim())
    .filter((l) => !isNoiseLine(l));
}

function parseMajorSectionHeading(line: string): string | null {
  const m = MAJOR_SECTION_PATTERN.exec(line);
  if (!m) {
    return null;
  }
  return `SECTION ${m[1]}: ${normalizeWhitespace(m[2] ?? "")}`.trim();
}

function parseSubsectionHeading(line: string): string | null {
  // Example: "1.1\tProject/Site Information" or "2.4\tStabilize Soils"
  //
  // Important: require a TAB delimiter to avoid misclassifying numeric value lines
  // like "10.2 Acres" or "1.04 acres" as headings.
  const m = SUBSECTION_PATTERN.exec(line);
  if (!m) {
    return null;
  }
  return `${m[1]} ${normalizeWhitespace(m[2] ?? "")}`.trim();
}

function splitKeyValue(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  // Avoid parsing URLs as key/value (e.g. "http://...").
  if (trimmed.includes("://")) {
    return null;
  }

  const idx = trimmed.indexOf(":");
  if (idx <= 0) {
    return null;
  }
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  if (!key) {
    return null;
  }
  // Heuristic: real labels tend to be short; long "keys" usually mean we split a sentence
  // like "... (including: ...)" which is not a field label we want to inventory.
  if (key.length > 80) {
    return null;
  }
  return { key, value };
}

function shouldTakeNextLineAsValue(
  keyNorm: string,
  nextValueLine: string
): boolean {
  const s = normalizeWhitespace(nextValueLine);
  if (!s) {
    return false;
  }
  if (CONTENTS_PATTERN.test(s)) {
    return false;
  }
  if (s.endsWith(":")) {
    return false;
  }
  // Template directional placeholders for coordinates; treat as non-values unless digits exist.
  if (COORDINATE_PLACEHOLDER_PATTERN.test(s)) {
    return false;
  }

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

  if (NUMERIC_VALUE_KEYS.has(keyNorm)) {
    return HAS_DIGIT_PATTERN.test(s);
  }
  if (FREE_TEXT_KEYS.has(keyNorm)) {
    return true;
  }

  // Default (should be rare; only used if a key was added to TAKE_NEXT_LINE_AS_VALUE_KEYS
  // but not categorized above).
  if (HAS_DIGIT_PATTERN.test(s)) {
    return true;
  }
  if (KNOWN_PLACEHOLDER_VALUE_PATTERN.test(s)) {
    return true;
  }
  return false;
}

function extractEntriesFromLines(params: {
  doc: DocFile;
  lines: string[];
}): Entry[] {
  const entries: Entry[] = [];

  let majorSection: string | null = null;
  let subsection: string | null = null;
  let block: string | null = null;
  let blockLineIndex = 0;
  let inContactBlock = false;

  // Detect we are inside the "real body" by observing project/site info has data lines.
  // We keep extracting even before this, but it helps contextual heuristics.
  let seenProjectSiteInfoWithValues = false;

  // A doc can share the same filename across emails; include emailId + basename for docId.
  const docId = `${params.doc.emailId}:${sha1Short(params.doc.fileName)}:${params.doc.fileName}`;

  const BLOCK_START_KEYS = new Set([
    "Operator(s)",
    "Project Manager",
    "SWPPP Contact(s)",
    "Emergency 24-Hour Contact",
    "This SWPPP AZ Prepared by",
  ]);

  const TAKE_NEXT_LINE_AS_VALUE_KEYS = new Set([
    // Title page field is often on the next line.
    "SWPPP Preparation Date",
    // Site estimate table rows often have the value on the next line.
    "Total project area",
    "Construction site area to be disturbed",
    "Percentage impervious area before construction",
    "Runoff coefficient before construction",
    "Percentage impervious area after construction",
    "Runoff coefficient after construction",
    // Coordinates in some docs are split; we only take next line if it looks like a value.
    "Latitude",
    "Longitude",
    // BMP detail tables often break these to the next line.
    "Installation Schedule",
    "Maintenance and Inspection",
    "Responsible Staff",
  ]);

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i];

    const major = parseMajorSectionHeading(line);
    if (major) {
      majorSection = major;
      subsection = null;
      block = null;
      blockLineIndex = 0;
      inContactBlock = false;
      continue;
    }

    const sub = parseSubsectionHeading(line);
    if (sub) {
      subsection = sub;
      // Reset block at each new subsection; nested blocks (Operator/BMP) will re-set it.
      block = null;
      blockLineIndex = 0;
      inContactBlock = false;
      continue;
    }

    // If we're inside a contact-info block (Operator(s), etc.), capture unlabeled lines too.
    // These are typically company names, addresses, and emails which often have no ":" label.
    if (
      block &&
      inContactBlock &&
      !isNoiseLine(line) &&
      !parseMajorSectionHeading(line) &&
      !parseSubsectionHeading(line) &&
      splitKeyValue(line) === null &&
      line.length <= 120
    ) {
      const keyNorm = `Line${blockLineIndex + 1}`;
      const valueNorm = normalizeWhitespace(line);
      if (valueNorm !== "") {
        const scopeParts: string[] = [];
        if (subsection) {
          scopeParts.push(subsection);
        } else if (majorSection) {
          scopeParts.push(majorSection);
        } else {
          scopeParts.push("TITLE");
        }
        scopeParts.push(block);
        scopeParts.push(keyNorm);

        entries.push({
          block,
          docId,
          emailId: params.doc.emailId,
          fileName: params.doc.fileName,
          filePath: params.doc.filePath,
          key: scopeParts.join("."),
          majorSection,
          subsection,
          value: valueNorm,
        });
        blockLineIndex++;
      }
      continue;
    }

    const kv = splitKeyValue(line);
    if (!kv) {
      continue;
    }

    const keyNorm = normalizeKey(kv.key);
    let valueNorm = normalizeWhitespace(kv.value);

    // Block starters (Operator(s), etc.)
    if (valueNorm === "" && BLOCK_START_KEYS.has(keyNorm)) {
      block = keyNorm;
      blockLineIndex = 0;
      // Only treat these as "contact blocks" in contexts where they actually contain
      // unlabeled contact lines (company name, address, email). These same labels
      // also appear in other sections (e.g. Section 8 appendices) where capturing
      // unlabeled lines would be mostly noise.
      inContactBlock =
        !(majorSection || subsection) || // title page area (before Section 1)
        Boolean(subsection?.startsWith("1.2")); // contact info section
      continue;
    }

    // BMP block starter
    if (valueNorm !== "") {
      const bmpMatch = BMP_DESCRIPTION_KEY_PATTERN.exec(keyNorm);
      if (bmpMatch?.[1]) {
        block = `BMP ${bmpMatch[1].toUpperCase()}`;
        blockLineIndex = 0;
        inContactBlock = false;
      }
    }

    // Some keys are "key:" and the value is on the next line.
    if (valueNorm === "") {
      const next = params.lines[i + 1];
      const nextIsHeading =
        Boolean(parseMajorSectionHeading(next ?? "")) ||
        Boolean(parseSubsectionHeading(next ?? ""));
      const nextKv = next ? splitKeyValue(next) : null;
      const nextNoise = !next || isNoiseLine(next);

      const nextLooksLikeValue =
        Boolean(next) &&
        !nextNoise &&
        !nextIsHeading &&
        nextKv === null &&
        // Heuristic: a "value line" usually contains digits/units or alphabetic text,
        // but not a long paragraph.
        next.length <= 120;

      if (nextLooksLikeValue && TAKE_NEXT_LINE_AS_VALUE_KEYS.has(keyNorm)) {
        const nextNorm = normalizeWhitespace(next ?? "");
        if (shouldTakeNextLineAsValue(keyNorm, nextNorm)) {
          valueNorm = nextNorm;
          i++;
        }
      }
    }

    // Track when we hit the real "1.1 Project/Site Information" values.
    if (
      subsection?.includes("1.1") &&
      subsection.toLowerCase().includes("project/site information") &&
      valueNorm !== ""
    ) {
      seenProjectSiteInfoWithValues = true;
    }

    const scopeParts: string[] = [];
    if (subsection) {
      scopeParts.push(subsection);
    } else if (majorSection) {
      scopeParts.push(majorSection);
    } else {
      scopeParts.push("TITLE");
    }
    if (block) {
      scopeParts.push(block);
    }
    scopeParts.push(keyNorm);

    const scopedKey = scopeParts.join(".");

    // Ignore empty values unless we're in Section 1 (where blanks indicate missing inputs).
    const keepEmpty =
      (majorSection?.startsWith("SECTION 1") ?? false) ||
      (subsection?.startsWith("1.") ?? false) ||
      !seenProjectSiteInfoWithValues;

    if (valueNorm === "" && !keepEmpty) {
      continue;
    }

    entries.push({
      block,
      docId,
      emailId: params.doc.emailId,
      fileName: params.doc.fileName,
      filePath: params.doc.filePath,
      key: scopedKey,
      majorSection,
      subsection,
      value: valueNorm,
    });
  }

  // Special capture: in many docs, the project name + address are unlabeled
  // right after the "1.1 Project/Site Information" heading. We recover them.
  for (let i = 0; i < params.lines.length; i++) {
    const sub = parseSubsectionHeading(params.lines[i] ?? "");
    if (!sub) {
      continue;
    }
    if (!sub.startsWith("1.1")) {
      continue;
    }
    if (!sub.toLowerCase().includes("project/site information")) {
      continue;
    }

    const rawAfter: string[] = [];
    for (let j = i + 1; j < params.lines.length && rawAfter.length < 5; j++) {
      const l = params.lines[j];
      if (!l) {
        break;
      }
      if (parseMajorSectionHeading(l) || parseSubsectionHeading(l)) {
        break;
      }
      if (splitKeyValue(l)) {
        break;
      }
      if (isNoiseLine(l)) {
        continue;
      }
      if (l.length > 120) {
        continue;
      }
      rawAfter.push(normalizeWhitespace(l));
    }

    if (rawAfter.length >= 2) {
      // Find nearest major section heading above this 1.1 instance.
      let majorForUnlabeled: string | null = null;
      for (let k = i; k >= 0; k--) {
        const m = parseMajorSectionHeading(params.lines[k] ?? "");
        if (m) {
          majorForUnlabeled = m;
          break;
        }
      }

      const base = "1.1 Project/Site Information.UNLABELED";
      const add = (k: string, v: string) => {
        entries.push({
          block: null,
          docId,
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
  }

  return entries;
}

function toTsvRow(cols: (string | number | null | undefined)[]): string {
  return cols
    .map((c) =>
      String(c ?? "")
        .replaceAll("\t", " ")
        .replaceAll("\n", " ")
    )
    .join("\t");
}

function main(): void {
  const { values } = parseArgs({
    allowPositionals: false,
    args: Bun.argv.slice(2),
    options: {
      in: {
        type: "string",
        default: "packages/narratives/data/intake/eva-to-jayson/by-email",
      },
      out: {
        type: "string",
        default:
          "packages/narratives/data/intake/eva-to-jayson/variable-inventory",
      },
      minLen: { type: "string", default: String(STRINGS_MIN_LEN_DEFAULT) },
      limit: { type: "string" },
    },
  });

  const inDir = String(values.in);
  const outDir = String(values.out);
  const minLen =
    Number.parseInt(String(values.minLen), 10) || STRINGS_MIN_LEN_DEFAULT;
  const limit = values.limit ? Number.parseInt(String(values.limit), 10) : null;

  mkdirSync(outDir, { recursive: true });

  const docs = listWordDocs(inDir);
  const docsToProcess = limit ? docs.slice(0, limit) : docs;

  console.log(
    `Scanning ${docsToProcess.length}/${docs.length} Word docs under ${inDir}...`
  );

  const entries: Entry[] = [];
  for (const doc of docsToProcess) {
    const lines = runStrings(doc.filePath, minLen);
    entries.push(...extractEntriesFromLines({ doc, lines }));
  }

  // Write entries.jsonl (large but grep-friendly).
  const entriesPath = join(outDir, "entries.jsonl");
  writeFileSync(
    entriesPath,
    `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`,
    "utf8"
  );

  // Aggregate by key.
  const keyAgg = new Map<
    string,
    { docs: Set<string>; values: Map<string, number>; blanks: number }
  >();
  for (const e of entries) {
    const agg =
      keyAgg.get(e.key) ??
      (() => {
        const fresh = {
          blanks: 0,
          docs: new Set<string>(),
          values: new Map<string, number>(),
        };
        keyAgg.set(e.key, fresh);
        return fresh;
      })();
    agg.docs.add(e.docId);
    if (e.value === "") {
      agg.blanks += 1;
    }
    agg.values.set(e.value, (agg.values.get(e.value) ?? 0) + 1);
  }

  const keyRows = [...keyAgg.entries()].map(([key, a]) => {
    const uniqueValues = a.values.size;
    const sampleValues = [...a.values.entries()]
      .toSorted((x, y) => y[1] - x[1])
      .slice(0, 8)
      .map(([v, count]) => ({ count, v }));
    return {
      blanks: a.blanks,
      docsWithKey: a.docs.size,
      key,
      sampleValues,
      uniqueValues,
    };
  });

  keyRows.sort((a, b) => {
    if (b.uniqueValues !== a.uniqueValues) {
      return b.uniqueValues - a.uniqueValues;
    }
    if (b.docsWithKey !== a.docsWithKey) {
      return b.docsWithKey - a.docsWithKey;
    }
    return a.key.localeCompare(b.key);
  });

  const keysTsvPath = join(outDir, "keys.tsv");
  writeFileSync(
    keysTsvPath,
    [
      "key\tdocs_with_key\tunique_values\tblank_values\tsample_values_json",
      ...keyRows.map((r) =>
        toTsvRow([
          r.key,
          r.docsWithKey,
          r.uniqueValues,
          r.blanks,
          JSON.stringify(r.sampleValues),
        ])
      ),
      "",
    ].join("\n"),
    "utf8"
  );

  // Per-doc core fields (best-effort, for quick browsing).
  const coreKeys = [
    "1.1 Project/Site Information.UNLABELED.project_name",
    "1.1 Project/Site Information.UNLABELED.address_line1",
    "1.1 Project/Site Information.UNLABELED.address_line2",
    "1.1 Project/Site Information.County or Similar Subdivision",
    "1.1 Project/Site Information.AZCON project or permit tracking number*",
    "1.1 Project/Site Information.AZPDES project or permit tracking number*",
    "1.2 Contact Information/Responsable Parties.Operator(s).Line1",
    "1.2 Contact Information/Responsable Parties.Operator(s).Contact",
    "1.2 Contact Information/Responsable Parties.Operator(s).Phone",
    "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Contact",
    "1.3 Nature and Sequence of Construction Activity.Estimated Project Start Date",
    "1.3 Nature and Sequence of Construction Activity.Estimated Project Completion Date",
    "1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Soil type(s)",
    "1.6 Receiving waters.Description of receiving waters",
    "1.6 Receiving waters.Description of storm sewer systems",
  ];

  const byDoc = new Map<string, Map<string, string>>();
  for (const e of entries) {
    const m = byDoc.get(e.docId) ?? new Map<string, string>();
    if (!byDoc.has(e.docId)) {
      byDoc.set(e.docId, m);
    }
    // Prefer first non-empty value.
    if (!m.has(e.key) || (m.get(e.key) === "" && e.value !== "")) {
      m.set(e.key, e.value);
    }
  }

  const docsTsvPath = join(outDir, "docs.tsv");
  const docIds = [...byDoc.keys()].toSorted();
  writeFileSync(
    docsTsvPath,
    [
      ["doc_id", "email_id", "file_name", ...coreKeys].join("\t"),
      ...docIds.map((docId) => {
        const firstEntry = entries.find((e) => e.docId === docId);
        const emailId = firstEntry?.emailId ?? "";
        const fileName = firstEntry?.fileName ?? "";
        const m = byDoc.get(docId);
        if (!m) {
          return toTsvRow([
            docId,
            emailId,
            fileName,
            ...coreKeys.map(() => ""),
          ]);
        }
        return toTsvRow([
          docId,
          emailId,
          fileName,
          ...coreKeys.map((k) => m.get(k) ?? ""),
        ]);
      }),
      "",
    ].join("\n"),
    "utf8"
  );

  console.log(`Wrote:\n  ${entriesPath}\n  ${keysTsvPath}\n  ${docsTsvPath}`);
}

main();
