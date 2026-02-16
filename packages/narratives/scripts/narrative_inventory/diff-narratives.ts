/**
 * Diff two narrative docs (from variable-inventory/entries.jsonl).
 *
 * Modes:
 * - canonical: diff the canonical MVP fields (human sized)
 * - all: diff all extracted keys, grouped by major/subsection
 *
 * Usage:
 *   bun packages/narratives/scripts/diff-narratives.ts --auto
 *   bun packages/narratives/scripts/diff-narratives.ts --a 10892 --b 10994
 *   bun packages/narratives/scripts/diff-narratives.ts --a <docId> --b <docId> --mode all
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { canonicalFields } from "./canonical-fields";
import type { DocMeta, Entry } from "./shared";
import {
  computeCanonicalValue,
  normalizeValue,
  normalizeWhitespace,
} from "./shared";

const DIGITS_ONLY_PATTERN = /^\d+$/;

// ============================================================================
// Data loading
// ============================================================================

interface InventoryData {
  docMaps: Map<string, Map<string, string>>;
  docMeta: Map<string, DocMeta>;
  keyScope: Map<string, { major: string; sub: string; block: string | null }>;
  docIds: string[];
  allKeys: string[];
}

function loadInventoryData(invDir: string): InventoryData {
  const entriesPath = join(invDir, "entries.jsonl");
  if (!existsSync(entriesPath)) {
    throw new Error(`Missing required file: ${entriesPath}`);
  }

  const entriesText = readFileSync(entriesPath, "utf8");

  const docMaps = new Map<string, Map<string, string>>();
  const docMeta = new Map<string, DocMeta>();
  const keyScope = new Map<
    string,
    { major: string; sub: string; block: string | null }
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
    if (!keyScope.has(e.key)) {
      const major = e.majorSection ?? "TITLE";
      const sub = e.subsection ?? major;
      keyScope.set(e.key, { block: e.block, major, sub });
    }
  }

  const docIds = [...docMaps.keys()].toSorted();
  const allKeys = [
    ...new Set([...docMaps.values()].flatMap((m) => [...m.keys()])),
  ].toSorted();

  return { allKeys, docIds, docMaps, docMeta, keyScope };
}

// ============================================================================
// Doc pair selection
// ============================================================================

function resolveDocId(
  sel: string,
  docIds: string[],
  docMaps: Map<string, Map<string, string>>
): string {
  if (docMaps.has(sel)) {
    return sel;
  }
  if (DIGITS_ONLY_PATTERN.test(sel)) {
    const prefix = `${sel}:`;
    const found = docIds.find((d) => d.startsWith(prefix));
    if (found) {
      return found;
    }
  }
  const found = docIds.find((d) => d.includes(sel));
  if (found) {
    return found;
  }
  throw new Error(`Could not resolve doc selector: ${sel}`);
}

function autoSelectMostDifferentPair(
  docIds: string[],
  docMaps: Map<string, Map<string, string>>,
  canonicalFlat: {
    id: string;
    label: string;
    sources?: string[];
    derive?: (doc: Map<string, string>, allKeys: string[]) => string;
  }[],
  allKeys: string[]
): { a: string; b: string } {
  const perDoc = docIds.map((docId) => {
    const doc = docMaps.get(docId);
    if (!doc) {
      throw new Error(`Missing document map for docId ${docId}`);
    }
    const obj = new Map<string, string>();
    for (const f of canonicalFlat) {
      obj.set(f.id, computeCanonicalValue(doc, allKeys, f));
    }
    return { docId, vals: obj };
  });

  const perDocWithSignal = perDoc.filter((d) => {
    const name = d.vals.get("project.name") ?? "";
    const addr = d.vals.get("project.address_line1") ?? "";
    const filled = [...d.vals.values()].filter((v) => v.trim() !== "").length;
    return Boolean(name.trim()) && Boolean(addr.trim()) && filled >= 10;
  });

  const pool = perDocWithSignal.length >= 2 ? perDocWithSignal : perDoc;

  let best: { a: string; b: string; score: number } | null = null;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      let score = 0;
      for (const f of canonicalFlat) {
        const va = pool[i]?.vals.get(f.id) ?? "";
        const vb = pool[j]?.vals.get(f.id) ?? "";
        if (normalizeValue(va) !== normalizeValue(vb)) {
          score += 1;
        }
      }
      if (!best || score > best.score) {
        best = { a: pool[i]?.docId, b: pool[j]?.docId, score };
      }
    }
  }
  if (!best) {
    throw new Error("Failed to auto-pick doc pair");
  }
  return { a: best.a, b: best.b };
}

// ============================================================================
// Diff builders
// ============================================================================

function buildCanonicalDiff(
  aMap: Map<string, string>,
  bMap: Map<string, string>,
  allKeys: string[],
  canonical: {
    group: string;
    fields: {
      id: string;
      label: string;
      sources?: string[];
      derive?: (doc: Map<string, string>, allKeys: string[]) => string;
    }[];
  }[]
): string[] {
  const md: string[] = [];
  for (const group of canonical) {
    md.push(`## ${group.group}`);
    md.push("");
    let any = false;
    for (const f of group.fields) {
      const va = computeCanonicalValue(aMap, allKeys, f);
      const vb = computeCanonicalValue(bMap, allKeys, f);
      if (normalizeValue(va) === normalizeValue(vb)) {
        continue;
      }
      any = true;
      md.push(`- \`${f.id}\` (${f.label})`);
      md.push(`  A: ${va || "(blank)"}`);
      md.push(`  B: ${vb || "(blank)"}`);
    }
    if (!any) {
      md.push("(no differences in this group)");
    }
    md.push("");
  }
  return md;
}

interface DiffEntry {
  major: string;
  sub: string;
  key: string;
  a: string;
  b: string;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    if (!map.has(key)) {
      map.set(key, list);
    }
    list.push(item);
  }
  return map;
}

function renderSubSectionDiffs(diffs: DiffEntry[]): string[] {
  const bySub = groupBy(diffs, (d) => d.sub);
  const md: string[] = [];
  for (const sub of [...bySub.keys()].toSorted()) {
    md.push(`### ${sub}`);
    md.push("");
    for (const d of bySub.get(sub) ?? []) {
      md.push(`- \`${d.key}\``);
      md.push(`  A: ${d.a || "(blank)"}`);
      md.push(`  B: ${d.b || "(blank)"}`);
    }
    md.push("");
  }
  return md;
}

function renderDiffsByMajorSection(diffs: DiffEntry[]): string[] {
  const byMajor = groupBy(diffs, (d) => d.major);
  const md: string[] = [];
  for (const major of [...byMajor.keys()].toSorted()) {
    md.push(`## ${major}`);
    md.push("");
    const list = byMajor.get(major);
    if (list) {
      md.push(...renderSubSectionDiffs(list));
    }
  }
  return md;
}

function buildAllKeysDiff(
  aMap: Map<string, string>,
  bMap: Map<string, string>,
  keyScope: Map<string, { major: string; sub: string; block: string | null }>
): string[] {
  const keys = new Set<string>([...aMap.keys(), ...bMap.keys()]);
  const diffs: DiffEntry[] = [];

  for (const k of [...keys].toSorted()) {
    const va = normalizeWhitespace(aMap.get(k) ?? "");
    const vb = normalizeWhitespace(bMap.get(k) ?? "");
    if (normalizeValue(va) === normalizeValue(vb)) {
      continue;
    }
    const scope = keyScope.get(k) ?? {
      block: null,
      major: "UNKNOWN",
      sub: "UNKNOWN",
    };
    diffs.push({ a: va, b: vb, key: k, major: scope.major, sub: scope.sub });
  }

  return renderDiffsByMajorSection(diffs);
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
      a: { type: "string" },
      b: { type: "string" },
      mode: { type: "string", default: "canonical" },
      out: { type: "string" },
      auto: { type: "boolean", default: false },
    },
  });

  const invDir = String(values.dir);
  const data = loadInventoryData(invDir);

  const mode = String(values.mode);
  if (mode !== "canonical" && mode !== "all") {
    throw new Error(`Invalid --mode: ${mode} (expected canonical|all)`);
  }

  const canonical = canonicalFields();
  const canonicalFlat = canonical.flatMap((g) => g.fields);

  let aDocId = values.a
    ? resolveDocId(String(values.a), data.docIds, data.docMaps)
    : "";
  let bDocId = values.b
    ? resolveDocId(String(values.b), data.docIds, data.docMaps)
    : "";

  if (values.auto || !(aDocId || bDocId)) {
    const picked = autoSelectMostDifferentPair(
      data.docIds,
      data.docMaps,
      canonicalFlat,
      data.allKeys
    );
    aDocId = picked.a;
    bDocId = picked.b;
  }

  if (!(aDocId && bDocId)) {
    throw new Error("Provide --a and --b, or use --auto");
  }

  const aMap = data.docMaps.get(aDocId);
  const bMap = data.docMaps.get(bDocId);
  const aInfo = data.docMeta.get(aDocId);
  const bInfo = data.docMeta.get(bDocId);
  if (!(aMap && bMap && aInfo && bInfo)) {
    throw new Error("Failed to load one or both selected documents");
  }

  const outPath = values.out
    ? String(values.out)
    : join(invDir, `DIFF_${aInfo.emailId}_${bInfo.emailId}_${mode}.md`);

  const md: string[] = [];
  md.push(`# Narrative Diff (${mode})`);
  md.push("");
  md.push(`- A: \`${aDocId}\` (${aInfo.fileName})`);
  md.push(`- B: \`${bDocId}\` (${bInfo.fileName})`);
  md.push("");

  if (mode === "canonical") {
    md.push(...buildCanonicalDiff(aMap, bMap, data.allKeys, canonical));
  } else {
    md.push(...buildAllKeysDiff(aMap, bMap, data.keyScope));
  }

  writeFileSync(outPath, md.join("\n"), "utf8");
  console.log(`Wrote:\n  ${outPath}`);
}

main();
