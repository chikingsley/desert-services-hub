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

interface DocMeta {
  emailId: string;
  fileName: string;
  filePath: string;
}

const CITY_STATE_ZIP_PATTERN =
  /^\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/;
const EMAIL_PATTERN = /\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b/;
const PHONE_PATTERN = /(\+?1[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/;
const DIGITS_ONLY_PATTERN = /^\d+$/;

function normalizeWhitespace(s: string): string {
  return s.replaceAll(/\s+/g, " ").trim();
}

function normalizeValue(s: string): string {
  return normalizeWhitespace(s).toLowerCase();
}

function tryParseCityStateZip(
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

function findFirstNonEmpty(doc: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = doc.get(k);
    if (v && v.trim() !== "") {
      return v;
    }
  }
  return "";
}

function findEmailInValues(values: string[]): string {
  for (const v of values) {
    const m = EMAIL_PATTERN.exec(v);
    if (m?.[0]) {
      return m[0];
    }
  }
  return "";
}

function findPhoneInValues(values: string[]): string {
  for (const v of values) {
    const m = PHONE_PATTERN.exec(v);
    if (m?.[0]) {
      return normalizeWhitespace(m[0]);
    }
  }
  return "";
}

interface CanonField {
  id: string;
  label: string;
  sources?: string[];
  derive?: (doc: Map<string, string>, allKeys: string[]) => string;
}

function canonicalFields(): { group: string; fields: CanonField[] }[] {
  // Keep in sync with report-variable-inventory.ts (duplicated on purpose for script isolation).
  return [
    {
      fields: [
        {
          id: "project.name",
          label: "Project name",
          sources: [
            "1.1 Project/Site Information.UNLABELED.project_name",
            "SECTION 8: CERTIFICATION AND NOTIFICATION.Project Name",
            "SECTION 8: CERTIFICATION AND NOTIFICATION.Project Title",
          ],
        },
        {
          id: "project.address_line1",
          label: "Project address line 1",
          sources: [
            "1.1 Project/Site Information.UNLABELED.address_line1",
            "TITLE.SWPPP Contact(s).Line2",
          ],
        },
        {
          id: "project.city_state_zip",
          label: "Project city/state/zip",
          sources: [
            "1.1 Project/Site Information.UNLABELED.address_line2",
            "TITLE.SWPPP Contact(s).Line3",
          ],
        },
        {
          id: "project.city",
          label: "Project city (derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.UNLABELED.address_line2",
              "TITLE.SWPPP Contact(s).Line3",
            ]);
            const parsed = raw ? tryParseCityStateZip(raw) : null;
            return parsed?.city ?? "";
          },
        },
        {
          id: "project.county",
          label: "County",
          sources: [
            "1.1 Project/Site Information.County or Similar Subdivision",
          ],
        },
      ],
      group: "Project",
    },
    {
      fields: [
        {
          id: "permit.number_best_effort",
          label: "Permit number (AZPDES/AZCON best-effort)",
          derive: (doc) => {
            const azpdes = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.AZPDES project or permit tracking number*",
              "TITLE.SWPPP Contact(s).AZPDES number",
            ]);
            if (azpdes) {
              return azpdes;
            }
            const azcon = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.AZCON project or permit tracking number*",
              "TITLE.SWPPP Contact(s).AZCON number",
            ]);
            return azcon;
          },
        },
      ],
      group: "Permit",
    },
    {
      fields: [
        {
          id: "dates.swppp_preparation_date",
          label: "SWPPP preparation date",
          sources: ["TITLE.SWPPP Contact(s).SWPPP Preparation Date"],
        },
        {
          id: "dates.project_start",
          label: "Estimated project start date",
          sources: [
            "1.3 Nature and Sequence of Construction Activity.Estimated Project Start Date",
            "TITLE.SWPPP Contact(s).Project Start Date",
          ],
        },
        {
          id: "dates.project_completion",
          label: "Estimated project completion date",
          sources: [
            "1.3 Nature and Sequence of Construction Activity.Estimated Project Completion Date",
          ],
        },
      ],
      group: "Dates",
    },
    {
      fields: [
        {
          id: "operator.company",
          label: "Operator company",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Line1",
            "TITLE.Operator(s).Line1",
          ],
        },
        {
          id: "operator.contact_name",
          label: "Operator contact name",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Contact",
            "TITLE.Operator(s).Contact",
          ],
        },
        {
          id: "operator.phone",
          label: "Operator phone",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Phone",
            "TITLE.Phone",
          ],
        },
        {
          id: "operator.email",
          label: "Operator email (best-effort)",
          derive: (doc, allKeys) => {
            const values: string[] = [];
            for (const k of allKeys) {
              if (
                k.startsWith("TITLE.Operator(s).Line") ||
                k.startsWith(
                  "1.2 Contact Information/Responsable Parties.Operator(s).Line"
                )
              ) {
                const v = doc.get(k);
                if (v) {
                  values.push(v);
                }
              }
            }
            return findEmailInValues(values);
          },
        },
        {
          id: "swppp_contact.name",
          label: "SWPPP contact name (best-effort)",
          sources: [
            "TITLE.SWPPP Contact(s).Line1",
            "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Line1",
          ],
        },
        {
          id: "emergency.contact_name",
          label: "Emergency contact name (best-effort)",
          derive: (doc, allKeys) => {
            const line2 = doc.get(
              "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line2"
            );
            if (line2?.trim()) {
              return line2.trim();
            }
            const values: string[] = [];
            for (const k of allKeys) {
              if (
                k.startsWith(
                  "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line"
                )
              ) {
                const v = doc.get(k);
                if (v) {
                  values.push(v);
                }
              }
            }
            return values[0]?.trim() ?? "";
          },
        },
        {
          id: "emergency.phone",
          label: "Emergency phone (best-effort)",
          derive: (doc, allKeys) => {
            const values: string[] = [];
            for (const k of allKeys) {
              if (
                k.startsWith(
                  "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line"
                )
              ) {
                const v = doc.get(k);
                if (v) {
                  values.push(v);
                }
              }
            }
            return findPhoneInValues(values);
          },
        },
      ],
      group: "Contacts",
    },
    {
      fields: [
        {
          id: "site.total_project_area",
          label: "Total project area (raw)",
          sources: ["1.5 Construction Site Estimates.Total project area"],
        },
        {
          id: "site.disturbed_area",
          label: "Disturbed area (raw)",
          sources: [
            "1.5 Construction Site Estimates.Construction site area to be disturbed",
          ],
        },
        {
          id: "site.soil_types",
          label: "Soil type(s)",
          sources: [
            "1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Soil type(s)",
          ],
        },
        {
          id: "site.receiving_waters",
          label: "Receiving waters",
          sources: ["1.6 Receiving waters.Description of receiving waters"],
        },
        {
          id: "site.storm_sewer_systems",
          label: "Storm sewer systems / MS4",
          sources: ["1.6 Receiving waters.Description of storm sewer systems"],
        },
      ],
      group: "Site Details",
    },
  ];
}

function computeCanonicalValue(
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

function main(): void {
  const { values } = parseArgs({
    allowPositionals: false,
    args: Bun.argv.slice(2),
    options: {
      dir: {
        type: "string",
        default: "packages/narratives/data/intake/eva-to-jayson/variable-inventory",
      },
      a: { type: "string" },
      b: { type: "string" },
      mode: { type: "string", default: "canonical" }, // canonical | all
      out: { type: "string" },
      auto: { type: "boolean", default: false },
    },
  });

  const invDir = String(values.dir);
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

  const mode = String(values.mode);
  if (mode !== "canonical" && mode !== "all") {
    throw new Error(`Invalid --mode: ${mode} (expected canonical|all)`);
  }

  const canonical = canonicalFields();
  const canonicalFlat = canonical.flatMap((g) => g.fields);

  const resolveDocId = (sel: string): string => {
    // If sel matches docId exactly, use it.
    if (docMaps.has(sel)) {
      return sel;
    }
    // If sel looks like an emailId (digits), pick the first docId starting with "<emailId>:"
    if (DIGITS_ONLY_PATTERN.test(sel)) {
      const prefix = `${sel}:`;
      const found = docIds.find((d) => d.startsWith(prefix));
      if (found) {
        return found;
      }
    }
    // As a last resort, substring match.
    const found = docIds.find((d) => d.includes(sel));
    if (found) {
      return found;
    }
    throw new Error(`Could not resolve doc selector: ${sel}`);
  };

  let aDocId = values.a ? resolveDocId(String(values.a)) : "";
  let bDocId = values.b ? resolveDocId(String(values.b)) : "";

  // Auto-select the most-different pair across canonical fields.
  if (values.auto || !(aDocId || bDocId)) {
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

    // Avoid picking a mostly-empty docx parse failure: require a minimum amount of signal.
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
    aDocId = best.a;
    bDocId = best.b;
  }

  if (!(aDocId && bDocId)) {
    throw new Error("Provide --a and --b, or use --auto");
  }

  const aMap = docMaps.get(aDocId);
  const bMap = docMaps.get(bDocId);
  const aInfo = docMeta.get(aDocId);
  const bInfo = docMeta.get(bDocId);
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
  } else {
    // all keys diff grouped by major/subsection
    const keys = new Set<string>([...aMap.keys(), ...bMap.keys()]);
    const diffs: {
      major: string;
      sub: string;
      key: string;
      a: string;
      b: string;
    }[] = [];
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

    const byMajor = new Map<
      string,
      { sub: string; key: string; a: string; b: string }[]
    >();
    for (const d of diffs) {
      const list = byMajor.get(d.major) ?? [];
      if (!byMajor.has(d.major)) {
        byMajor.set(d.major, list);
      }
      list.push({ a: d.a, b: d.b, key: d.key, sub: d.sub });
    }

    for (const major of [...byMajor.keys()].toSorted()) {
      md.push(`## ${major}`);
      md.push("");
      const list = byMajor.get(major);
      if (!list) {
        continue;
      }
      // subgroup by subsection
      const bySub = new Map<string, { key: string; a: string; b: string }[]>();
      for (const d of list) {
        const s = d.sub;
        const l = bySub.get(s) ?? [];
        if (!bySub.has(s)) {
          bySub.set(s, l);
        }
        l.push({ a: d.a, b: d.b, key: d.key });
      }
      for (const sub of [...bySub.keys()].toSorted()) {
        md.push(`### ${sub}`);
        md.push("");
        const subDiffs = bySub.get(sub) ?? [];
        for (const d of subDiffs) {
          md.push(`- \`${d.key}\``);
          md.push(`  A: ${d.a || "(blank)"}`);
          md.push(`  B: ${d.b || "(blank)"}`);
        }
        md.push("");
      }
    }
  }

  writeFileSync(outPath, md.join("\n"), "utf8");
  console.log(`Wrote:\n  ${outPath}`);
}

main();
