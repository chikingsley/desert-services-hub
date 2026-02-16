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

interface KeyRow {
  key: string;
  docs_with_key: number;
  unique_values: number;
  blank_values: number;
  sample_values_json: string;
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

interface DocMeta {
  emailId: string;
  fileName: string;
  filePath: string;
}

const CITY_STATE_ZIP_PATTERN =
  /^\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/;
const ACRES_VALUE_PATTERN = /([0-9]+(?:\.[0-9]+)?)/;
const EMAIL_PATTERN = /\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b/;
const PHONE_PATTERN = /(\+?1[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/;

function normalizeWhitespace(s: string): string {
  return s.replaceAll(/\s+/g, " ").trim();
}

function normalizeValue(s: string): string {
  return normalizeWhitespace(s).toLowerCase();
}

function parseTsv(path: string): { header: string[]; rows: string[][] } {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }
  const header = lines[0]?.split("\t");
  const rows = lines.slice(1).map((l) => l.split("\t"));
  return { header, rows };
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

function tryParseAcres(s: string): number | null {
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
  // We keep this permissive; narratives have many formats.
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
  sources?: string[]; // in priority order
  derive?: (doc: Map<string, string>, allKeys: string[]) => string;
}

function canonicalFields(): { group: string; fields: CanonField[] }[] {
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
            "1.2 Contact Information/Responsable Parties.Project Manager.Line2",
          ],
        },
        {
          id: "project.city_state_zip",
          label: "Project city/state/zip (single line)",
          sources: [
            "1.1 Project/Site Information.UNLABELED.address_line2",
            "TITLE.SWPPP Contact(s).Line3",
            "1.2 Contact Information/Responsable Parties.Project Manager.Line3",
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
          id: "project.state",
          label: "Project state (derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.UNLABELED.address_line2",
              "TITLE.SWPPP Contact(s).Line3",
            ]);
            const parsed = raw ? tryParseCityStateZip(raw) : null;
            return parsed?.state ?? "";
          },
        },
        {
          id: "project.zip",
          label: "Project zip (derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.1 Project/Site Information.UNLABELED.address_line2",
              "TITLE.SWPPP Contact(s).Line3",
            ]);
            const parsed = raw ? tryParseCityStateZip(raw) : null;
            return parsed?.zip ?? "";
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
          id: "permit.azpdes_number",
          label: "AZPDES tracking number",
          sources: [
            "1.1 Project/Site Information.AZPDES project or permit tracking number*",
            "TITLE.SWPPP Contact(s).AZPDES number",
          ],
        },
        {
          id: "permit.azcon_number",
          label: "AZCON tracking number",
          sources: [
            "1.1 Project/Site Information.AZCON project or permit tracking number*",
            "TITLE.SWPPP Contact(s).AZCON number",
          ],
        },
        {
          id: "permit.number_best_effort",
          label: "Permit number (best-effort AZPDES/AZCON)",
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
            "TITLE.Operator(s).Phone",
            "TITLE.Phone",
          ],
        },
        {
          id: "operator.email",
          label: "Operator email (best-effort scan)",
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
          id: "operator.address_line1",
          label: "Operator address line 1",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Line2",
            "TITLE.Operator(s).Line2",
          ],
        },
        {
          id: "operator.city_state_zip",
          label: "Operator city/state/zip",
          sources: [
            "1.2 Contact Information/Responsable Parties.Operator(s).Line3",
            "TITLE.Operator(s).Line3",
          ],
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
          id: "swppp_contact.phone",
          label: "SWPPP contact phone",
          sources: [
            "1.2 Contact Information/Responsable Parties.SWPPP Contact(s).Phone",
            "TITLE.SWPPP Contact(s).Phone",
            "TITLE.Phone",
          ],
        },
        {
          id: "emergency.contact_name",
          label: "Emergency 24-hour contact name (best-effort scan)",
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
            // Prefer the \"Line2\" if present (often the person name); fallback to first non-empty.
            const line2 = doc.get(
              "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line2"
            );
            if (line2?.trim()) {
              return line2.trim();
            }
            return values[0]?.trim() ?? "";
          },
        },
        {
          id: "emergency.phone",
          label: "Emergency 24-hour phone (best-effort scan)",
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
            const line3 = doc.get(
              "1.2 Contact Information/Responsable Parties.Emergency 24-Hour Contact.Line3"
            );
            if (line3) {
              const p = findPhoneInValues([line3]);
              if (p) {
                return p;
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
          id: "site.total_project_area_acres",
          label: "Total project area (acres; raw)",
          sources: ["1.5 Construction Site Estimates.Total project area"],
        },
        {
          id: "site.total_project_area_acres_number",
          label: "Total project area (acres; numeric derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.5 Construction Site Estimates.Total project area",
            ]);
            const n = raw ? tryParseAcres(raw) : null;
            return n === null ? "" : String(n);
          },
        },
        {
          id: "site.disturbed_area_acres",
          label: "Disturbed area (acres; raw)",
          sources: [
            "1.5 Construction Site Estimates.Construction site area to be disturbed",
          ],
        },
        {
          id: "site.disturbed_area_acres_number",
          label: "Disturbed area (acres; numeric derived)",
          derive: (doc) => {
            const raw = findFirstNonEmpty(doc, [
              "1.5 Construction Site Estimates.Construction site area to be disturbed",
            ]);
            const n = raw ? tryParseAcres(raw) : null;
            return n === null ? "" : String(n);
          },
        },
        {
          id: "site.soil_types",
          label: "Soil type(s)",
          sources: [
            "1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Soil type(s)",
          ],
        },
        {
          id: "site.slopes",
          label: "Slopes (often blank)",
          sources: [
            "1.4 Soils, Slopes, Vegetation, and Current Drainage Patterns.Slopes",
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
    {
      fields: [
        {
          id: "bmp.ec7.responsible_staff",
          label: "BMP EC-7 responsible staff",
          sources: ["2.4 Stabilize Soils.BMP EC-7.Responsible Staff"],
        },
        {
          id: "bmp.ec7.installation_schedule",
          label: "BMP EC-7 installation schedule",
          sources: ["2.4 Stabilize Soils.BMP EC-7.Installation Schedule"],
        },
        {
          id: "bmp.ec7.maintenance",
          label: "BMP EC-7 maintenance/inspection",
          sources: ["2.4 Stabilize Soils.BMP EC-7.Maintenance and Inspection"],
        },
      ],
      group: "BMP (High Variance)",
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

  // Build per-doc key/value map (first non-empty).
  const docMaps = new Map<string, Map<string, string>>();
  const docMeta = new Map<string, DocMeta>();
  const keyMeta = new Map<
    string,
    { major: string | null; sub: string | null; block: string | null }
  >();

  const entriesText = readFileSync(entriesPath, "utf8");
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
  const allKeyNames = [...new Set(keyRows.map((r) => r.key))].toSorted();

  const keysTotal = keyRows.length;
  const keysVary = keyRows.filter((r) => r.unique_values > 1).length;
  const keysConstant = keyRows.filter((r) => r.unique_values === 1).length;

  // Top varying keys (high coverage + high variance) for quick eyeballing.
  const topVary = [...keyRows]
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

  // Build canonical MVP table.
  const canonical = canonicalFields();
  const canonicalFlat: CanonField[] = canonical.flatMap((g) => g.fields);

  const canonicalStats = canonicalFlat.map((f) => {
    const values: string[] = [];
    let covered = 0;
    for (const docId of allDocIds) {
      const doc = docMaps.get(docId) ?? new Map<string, string>();
      const v = computeCanonicalValue(doc, allKeyNames, f);
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
      group: canonical.find((g) => g.fields.includes(f))?.group ?? "Other",
      id: f.id,
      label: f.label,
      sample,
      sources: f.sources ?? null,
      unique_values: uniques.size,
    };
  });

  // Write per-doc canonical values (spreadsheet-friendly).
  const canonicalDocsTsvPath = join(invDir, "CANONICAL_DOCS.tsv");
  writeFileSync(
    canonicalDocsTsvPath,
    [
      [
        "doc_id",
        "email_id",
        "file_name",
        ...canonicalFlat.map((f) => f.id),
      ].join("\t"),
      ...allDocIds.map((docId) => {
        const meta = docMeta.get(docId);
        const doc = docMaps.get(docId) ?? new Map<string, string>();
        const vals = canonicalFlat.map((f) =>
          computeCanonicalValue(doc, allKeyNames, f)
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
  const md: string[] = [];
  md.push("# Variable Inventory Report (Eva -> Jayson Narratives)");
  md.push("");
  md.push(`Inventory directory: \`${invDir}\``);
  md.push("");
  md.push("## Counts");
  md.push("");
  md.push(`- Docs scanned: **${docsCount}** (docs.tsv rows)`);
  md.push(`- Distinct extracted keys: **${keysTotal}**`);
  md.push(`- Keys that vary across docs: **${keysVary}**`);
  md.push(`- Keys that are constant across docs: **${keysConstant}**`);
  md.push("");
  md.push("## Canonical MVP Fields");
  md.push("");
  md.push(
    "This collapses duplicated fields across TITLE/Section 1/Section 8 into a smaller list."
  ); // human hint
  md.push("Machine-readable list: `CANONICAL_MVP.tsv`");
  md.push("Per-doc canonical values: `CANONICAL_DOCS.tsv`");
  md.push("");

  for (const group of canonical) {
    md.push(`### ${group.group}`);
    md.push("");
    for (const f of group.fields) {
      const s = canonicalStats.find((x) => x.id === f.id);
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
    const meta = keyMeta.get(r.key);
    const scope = meta?.sub ?? meta?.major ?? "TITLE";
    md.push(
      `- \`${r.key}\` (docs=${r.docs_with_key}, unique=${r.unique_values}) [scope=${scope}]`
    );
  }
  md.push("");

  writeFileSync(reportPath, md.join("\n"), "utf8");

  console.log(
    `Wrote:\n  ${reportPath}\n  ${canonicalTsvPath}\n  ${canonicalDocsTsvPath}`
  );
}

main();
