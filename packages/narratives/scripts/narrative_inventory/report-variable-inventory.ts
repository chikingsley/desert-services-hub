/**
 * Summarize the extracted narrative "variable inventory" into a smaller canonical list.
 *
 * This is meant to answer: "what actually changes from project to project?"
 *
 * Outputs (under --dir):
 * - REPORT.md: human-friendly summary
 * - CANONICAL_MVP.tsv: canonical field list with coverage + samples
 *
 * Usage:
 *   bun packages/narratives/scripts/report-variable-inventory.ts
 *   bun packages/narratives/scripts/report-variable-inventory.ts --dir packages/narratives/data/intake/eva-to-jayson/variable-inventory
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { canonicalFields } from "./canonical-fields";
import type { CanonField, DocMeta, Entry } from "./shared";
import {
  computeCanonicalValue,
  normalizeValue,
  parseTsv,
  toTsvRow,
} from "./shared";

interface KeyRow {
  key: string;
  docs_with_key: number;
  unique_values: number;
  blank_values: number;
  sample_values_json: string;
}

interface CanonicalStat {
  id: string;
  label: string;
  group: string;
  covered_docs: number;
  unique_values: number;
  sources: string[] | null;
  sample: { v: string; count: number }[];
}

interface InventoryData {
  docMaps: Map<string, Map<string, string>>;
  docMeta: Map<string, DocMeta>;
  keyMeta: Map<
    string,
    { major: string | null; sub: string | null; block: string | null }
  >;
  allDocIds: string[];
}

// ============================================================================
// Data loading
// ============================================================================

function loadInventoryData(entriesPath: string): InventoryData {
  const entriesText = readFileSync(entriesPath, "utf8");
  const docMaps = new Map<string, Map<string, string>>();
  const docMeta = new Map<string, DocMeta>();
  const keyMeta = new Map<
    string,
    { major: string | null; sub: string | null; block: string | null }
  >();

  for (const line of entriesText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const e = JSON.parse(trimmed) as Entry;
    const m = docMaps.get(e.docId) ?? new Map<string, string>();
    if (!docMaps.has(e.docId)) {
      docMaps.set(e.docId, m);
    }
    const existing = m.get(e.key) ?? "";
    if (!existing || (existing === "" && e.value !== "")) {
      m.set(e.key, e.value);
    }
    if (!docMeta.has(e.docId)) {
      docMeta.set(e.docId, {
        emailId: e.emailId,
        fileName: e.fileName,
        filePath: e.filePath,
      });
    }
    if (!keyMeta.has(e.key)) {
      keyMeta.set(e.key, {
        block: e.block,
        major: e.majorSection,
        sub: e.subsection,
      });
    }
  }

  const allDocIds = [...docMaps.keys()].toSorted();
  return { allDocIds, docMaps, docMeta, keyMeta };
}

// ============================================================================
// Canonical stats
// ============================================================================

function buildCanonicalStats(params: {
  canonical: { group: string; fields: CanonField[] }[];
  allDocIds: string[];
  docMaps: Map<string, Map<string, string>>;
  allKeyNames: string[];
}): CanonicalStat[] {
  const canonicalFlat = params.canonical.flatMap((g) => g.fields);
  return canonicalFlat.map((f) => {
    const values: string[] = [];
    let covered = 0;
    for (const docId of params.allDocIds) {
      const doc = params.docMaps.get(docId) ?? new Map<string, string>();
      const v = computeCanonicalValue(doc, params.allKeyNames, f);
      if (v) {
        covered += 1;
        values.push(v);
      }
    }
    const uniques = new Map<string, number>();
    for (const v of values) {
      const n = normalizeValue(v);
      uniques.set(n, (uniques.get(n) ?? 0) + 1);
    }
    const sample = [...uniques.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([v, count]) => ({ count, v }));

    return {
      covered_docs: covered,
      group:
        params.canonical.find((g) => g.fields.includes(f))?.group ?? "Other",
      id: f.id,
      label: f.label,
      sample,
      sources: f.sources ?? null,
      unique_values: uniques.size,
    };
  });
}

// ============================================================================
// Output writers
// ============================================================================

function writeCanonicalDocsTsv(params: {
  path: string;
  canonicalFlat: CanonField[];
  allDocIds: string[];
  docMaps: Map<string, Map<string, string>>;
  docMeta: Map<string, DocMeta>;
  allKeyNames: string[];
}): void {
  writeFileSync(
    params.path,
    [
      [
        "doc_id",
        "email_id",
        "file_name",
        ...params.canonicalFlat.map((f) => f.id),
      ].join("\t"),
      ...params.allDocIds.map((docId) => {
        const meta = params.docMeta.get(docId);
        const doc = params.docMaps.get(docId) ?? new Map<string, string>();
        const vals = params.canonicalFlat.map((f) =>
          computeCanonicalValue(doc, params.allKeyNames, f)
        );
        return toTsvRow([
          docId,
          meta?.emailId ?? "",
          meta?.fileName ?? "",
          ...vals,
        ]);
      }),
      "",
    ].join("\n"),
    "utf8"
  );
}

function writeReport(params: {
  path: string;
  invDir: string;
  docsCount: number;
  keyRows: KeyRow[];
  canonical: { group: string; fields: CanonField[] }[];
  canonicalStats: CanonicalStat[];
  keyMeta: Map<
    string,
    { major: string | null; sub: string | null; block: string | null }
  >;
}): void {
  const keysTotal = params.keyRows.length;
  const keysVary = params.keyRows.filter((r) => r.unique_values > 1).length;
  const keysConstant = params.keyRows.filter(
    (r) => r.unique_values === 1
  ).length;

  const topVary = [...params.keyRows]
    .filter((r) => r.unique_values > 1 && r.docs_with_key >= 150)
    .toSorted((a, b) => {
      if (b.unique_values !== a.unique_values) {
        return b.unique_values - a.unique_values;
      }
      if (b.docs_with_key !== a.docs_with_key) {
        return b.docs_with_key - a.docs_with_key;
      }
      return a.key.localeCompare(b.key);
    })
    .slice(0, 40);

  const md: string[] = [];
  md.push("# Variable Inventory Report (Eva -> Jayson Narratives)");
  md.push("");
  md.push(`Inventory directory: \`${params.invDir}\``);
  md.push("");
  md.push("## Counts");
  md.push("");
  md.push(`- Docs scanned: **${params.docsCount}** (docs.tsv rows)`);
  md.push(`- Distinct extracted keys: **${keysTotal}**`);
  md.push(`- Keys that vary across docs: **${keysVary}**`);
  md.push(`- Keys that are constant across docs: **${keysConstant}**`);
  md.push("");
  md.push("## Canonical MVP Fields");
  md.push("");
  md.push(
    "This collapses duplicated fields across TITLE/Section 1/Section 8 into a smaller list."
  );
  md.push("Machine-readable list: `CANONICAL_MVP.tsv`");
  md.push("Per-doc canonical values: `CANONICAL_DOCS.tsv`");
  md.push("");

  for (const group of params.canonical) {
    md.push(`### ${group.group}`);
    md.push("");
    for (const f of group.fields) {
      const s = params.canonicalStats.find((x) => x.id === f.id);
      if (!s) {
        continue;
      }
      md.push(
        `- \`${s.id}\`: ${s.label} (covered_docs=${s.covered_docs}, unique=${s.unique_values})`
      );
      md.push(
        `sources: ${
          f.sources?.length
            ? f.sources.map((k) => `\`${k}\``).join(", ")
            : "(derived)"
        }`
      );
    }
    md.push("");
  }

  md.push("## Top High-Variance Keys (Raw Extraction)");
  md.push("");
  md.push(
    "These are individual extracted keys with high coverage and high variance (not yet deduped)."
  );
  md.push("");
  for (const r of topVary) {
    const meta = params.keyMeta.get(r.key);
    const scope = meta?.sub ?? meta?.major ?? "TITLE";
    md.push(
      `- \`${r.key}\` (docs=${r.docs_with_key}, unique=${r.unique_values}) [scope=${scope}]`
    );
  }
  md.push("");

  writeFileSync(params.path, md.join("\n"), "utf8");
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const { values } = parseArgs({
    allowPositionals: false,
    args: Bun.argv.slice(2),
    options: {
      dir: {
        type: "string",
        default:
          "packages/narratives/data/intake/eva-to-jayson/variable-inventory",
      },
    },
  });

  const invDir = String(values.dir);
  const keysPath = join(invDir, "keys.tsv");
  const docsPath = join(invDir, "docs.tsv");
  const entriesPath = join(invDir, "entries.jsonl");

  for (const p of [keysPath, docsPath, entriesPath]) {
    if (!existsSync(p)) {
      throw new Error(`Missing required file: ${p}`);
    }
  }

  const { header, rows } = parseTsv(keysPath);
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) {
      throw new Error(`keys.tsv missing column: ${name}`);
    }
    return i;
  };

  const keyRows: KeyRow[] = rows.map((r) => ({
    blank_values: Number.parseInt(r[idx("blank_values")] ?? "0", 10) || 0,
    docs_with_key: Number.parseInt(r[idx("docs_with_key")] ?? "0", 10) || 0,
    key: r[idx("key")] ?? "",
    sample_values_json: r[idx("sample_values_json")] ?? "[]",
    unique_values: Number.parseInt(r[idx("unique_values")] ?? "0", 10) || 0,
  }));

  const docsTsv = parseTsv(docsPath);
  const docsCount = Math.max(0, docsTsv.rows.length);

  const data = loadInventoryData(entriesPath);
  const allKeyNames = [...new Set(keyRows.map((r) => r.key))].toSorted();

  const canonical = canonicalFields();
  const canonicalFlat = canonical.flatMap((g) => g.fields);

  const canonicalStats = buildCanonicalStats({
    allDocIds: data.allDocIds,
    allKeyNames,
    canonical,
    docMaps: data.docMaps,
  });

  writeCanonicalDocsTsv({
    allDocIds: data.allDocIds,
    allKeyNames,
    canonicalFlat,
    docMaps: data.docMaps,
    docMeta: data.docMeta,
    path: join(invDir, "CANONICAL_DOCS.tsv"),
  });

  const canonicalTsvPath = join(invDir, "CANONICAL_MVP.tsv");
  writeFileSync(
    canonicalTsvPath,
    [
      "canonical_field\tlabel\tgroup\tcovered_docs\tunique_values\tsources_json\tsample_values_json",
      ...canonicalStats.map((s) =>
        toTsvRow([
          s.id,
          s.label,
          s.group,
          s.covered_docs,
          s.unique_values,
          JSON.stringify(s.sources ?? []),
          JSON.stringify(s.sample),
        ])
      ),
      "",
    ].join("\n"),
    "utf8"
  );

  const reportPath = join(invDir, "REPORT.md");
  writeReport({
    canonical,
    canonicalStats,
    docsCount,
    invDir,
    keyMeta: data.keyMeta,
    keyRows,
    path: reportPath,
  });

  console.log(
    `Wrote:\n  ${reportPath}\n  ${canonicalTsvPath}\n  ${join(invDir, "CANONICAL_DOCS.tsv")}`
  );
}

main();
