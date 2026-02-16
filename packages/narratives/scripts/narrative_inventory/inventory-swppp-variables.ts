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

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";

import type { DocFile } from "./inventory-extraction";
import { extractEntriesFromLines, isNoiseLine } from "./inventory-extraction";
import type { Entry } from "./shared";
import { toTsvRow } from "./shared";

const WORD_EXTS = new Set([".doc", ".docx", ".docm"]);
const STRINGS_MIN_LEN_DEFAULT = 8;

// ============================================================================
// File discovery
// ============================================================================

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

// ============================================================================
// Strings extraction
// ============================================================================

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

// ============================================================================
// Aggregation
// ============================================================================

function aggregateKeyStats(entries: Entry[]): {
  key: string;
  docsWithKey: number;
  uniqueValues: number;
  blanks: number;
  sampleValues: { v: string; count: number }[];
}[] {
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

  const rows = [...keyAgg.entries()].map(([key, a]) => {
    const sampleValues = [...a.values.entries()]
      .toSorted((x, y) => y[1] - x[1])
      .slice(0, 8)
      .map(([v, count]) => ({ count, v }));
    return {
      blanks: a.blanks,
      docsWithKey: a.docs.size,
      key,
      sampleValues,
      uniqueValues: a.values.size,
    };
  });

  rows.sort((a, b) => {
    if (b.uniqueValues !== a.uniqueValues) {
      return b.uniqueValues - a.uniqueValues;
    }
    if (b.docsWithKey !== a.docsWithKey) {
      return b.docsWithKey - a.docsWithKey;
    }
    return a.key.localeCompare(b.key);
  });

  return rows;
}

function buildPerDocMap(entries: Entry[]): Map<string, Map<string, string>> {
  const byDoc = new Map<string, Map<string, string>>();
  for (const e of entries) {
    const m = byDoc.get(e.docId) ?? new Map<string, string>();
    if (!byDoc.has(e.docId)) {
      byDoc.set(e.docId, m);
    }
    if (!m.has(e.key) || (m.get(e.key) === "" && e.value !== "")) {
      m.set(e.key, e.value);
    }
  }
  return byDoc;
}

// ============================================================================
// Output writers
// ============================================================================

const CORE_KEYS = [
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

function writeDocsTsv(
  path: string,
  byDoc: Map<string, Map<string, string>>,
  entries: Entry[]
): void {
  const docIds = [...byDoc.keys()].toSorted();
  writeFileSync(
    path,
    [
      ["doc_id", "email_id", "file_name", ...CORE_KEYS].join("\t"),
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
            ...CORE_KEYS.map(() => ""),
          ]);
        }
        return toTsvRow([
          docId,
          emailId,
          fileName,
          ...CORE_KEYS.map((k) => m.get(k) ?? ""),
        ]);
      }),
      "",
    ].join("\n"),
    "utf8"
  );
}

// ============================================================================
// Main
// ============================================================================

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

  const entriesPath = join(outDir, "entries.jsonl");
  writeFileSync(
    entriesPath,
    `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`,
    "utf8"
  );

  const keyRows = aggregateKeyStats(entries);
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

  const byDoc = buildPerDocMap(entries);
  const docsTsvPath = join(outDir, "docs.tsv");
  writeDocsTsv(docsTsvPath, byDoc, entries);

  console.log(`Wrote:\n  ${entriesPath}\n  ${keysTsvPath}\n  ${docsTsvPath}`);
}

main();
