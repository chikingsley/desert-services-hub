/**
 * Seed the permit search eval dataset.
 *
 * Generates BEIR-format files from live permit data:
 *   corpus.jsonl  — all permits
 *   queries.jsonl — synthetic queries derived from permit fields
 *   qrels.tsv    — ground truth (query → permit)
 *
 * Query types generated per permit:
 *   - project_name: exact project name
 *   - company_project: company + project fragment
 *   - partial_project: first 2 words of project name
 *   - permit_id: the D0XXXXXX ID
 *   - address_city: address + city combo (when available)
 *
 * Usage: bun run evals/permits/seed-dataset.ts [--count 200]
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@lib/db/client";

const DIR = import.meta.dirname ?? join(process.cwd(), "evals/permits");
const SAMPLE_COUNT = Number(
  process.argv.includes("--count")
    ? process.argv[process.argv.indexOf("--count") + 1]
    : 200
);
const WHITESPACE_RE = /\s+/;

interface Permit {
  address: string | null;
  city: string | null;
  company_name: string | null;
  id: string;
  project_name: string | null;
  status: string | null;
}

interface Query {
  _id: string;
  metadata: {
    type: string;
    permit_id: string;
  };
  text: string;
}

function generateQueries(p: Permit): Query[] {
  const queries: Query[] = [];

  // Always: permit ID lookup
  queries.push({
    _id: `${p.id}_id`,
    text: p.id,
    metadata: { type: "permit_id", permit_id: p.id },
  });

  // Project name (if non-null and non-trivial)
  if (p.project_name && p.project_name.length > 3) {
    queries.push({
      _id: `${p.id}_project`,
      text: p.project_name,
      metadata: { type: "project_name", permit_id: p.id },
    });

    // Partial project: first 2 words (if multi-word)
    const words = p.project_name.split(WHITESPACE_RE);
    if (words.length >= 3) {
      queries.push({
        _id: `${p.id}_partial`,
        text: words.slice(0, 2).join(" "),
        metadata: { type: "partial_project", permit_id: p.id },
      });
    }
  }

  // Company + project fragment
  if (p.company_name && p.project_name && p.project_name.length > 3) {
    const companyFirst = p.company_name.split(WHITESPACE_RE)[0];
    const projectFirst = p.project_name.split(WHITESPACE_RE)[0];
    queries.push({
      _id: `${p.id}_combo`,
      text: `${companyFirst} ${projectFirst}`,
      metadata: { type: "company_project", permit_id: p.id },
    });
  }

  // Address + city
  if (p.address && p.city) {
    queries.push({
      _id: `${p.id}_addr`,
      text: `${p.address} ${p.city}`,
      metadata: { type: "address_city", permit_id: p.id },
    });
  }

  return queries;
}

async function main() {
  console.log(
    `Seeding permit eval dataset (target: ${SAMPLE_COUNT} permits)...`
  );

  // Fetch all permits for corpus
  const allPermits = await db
    .query<Permit>(
      `SELECT id, company_name, project_name, address, city, status
       FROM dust_permits_filed_by_desert_services
       ORDER BY id`
    )
    .all();
  console.log(`  ${allPermits.length} total permits in corpus`);

  // Sample permits for query generation: prioritize those with rich data
  // Active first, then with project names, stratify by company (max 5 per company)
  const perCompany = new Map<string, Permit[]>();
  for (const p of allPermits) {
    if (!p.project_name || p.project_name.length <= 3) {
      continue;
    }
    const key = p.company_name ?? "_unknown";
    const list = perCompany.get(key) ?? [];
    if (list.length < 5) {
      list.push(p);
      perCompany.set(key, list);
    }
  }

  const pool = [...perCompany.values()].flat();
  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sampled = pool.slice(0, SAMPLE_COUNT);
  console.log(
    `  ${sampled.length} permits sampled across ${new Set(sampled.map((p) => p.company_name)).size} companies`
  );

  // Generate queries
  const allQueries: Query[] = [];
  for (const p of sampled) {
    allQueries.push(...generateQueries(p));
  }
  console.log(`  ${allQueries.length} queries generated`);

  // Write corpus.jsonl
  const corpusPath = join(DIR, "corpus.jsonl");
  writeFileSync(
    corpusPath,
    `${allPermits
      .map((p) =>
        JSON.stringify({
          _id: p.id,
          title: [p.company_name, p.project_name].filter(Boolean).join(" - "),
          text: [
            p.id,
            p.company_name,
            p.project_name,
            p.address,
            p.city,
            p.status,
          ]
            .filter(Boolean)
            .join(" | "),
        })
      )
      .join("\n")}\n`
  );
  console.log(`  Wrote ${corpusPath}`);

  // Write queries.jsonl
  const queriesPath = join(DIR, "queries.jsonl");
  writeFileSync(
    queriesPath,
    `${allQueries.map((q) => JSON.stringify(q)).join("\n")}\n`
  );
  console.log(`  Wrote ${queriesPath}`);

  // Write qrels.tsv
  const qrelsPath = join(DIR, "qrels.tsv");
  const qrelsLines = ["query-id\tcorpus-id\tscore"];
  for (const q of allQueries) {
    qrelsLines.push(`${q._id}\t${q.metadata.permit_id}\t1`);
  }
  writeFileSync(qrelsPath, `${qrelsLines.join("\n")}\n`);
  console.log(`  Wrote ${qrelsPath}`);

  // Stats
  const typeCounts = new Map<string, number>();
  for (const q of allQueries) {
    typeCounts.set(q.metadata.type, (typeCounts.get(q.metadata.type) ?? 0) + 1);
  }
  console.log("\nQuery type distribution:");
  for (const [type, count] of typeCounts) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(
    "\nDone. Run eval with: bun run evals/permits/eval.ts --strategy fts"
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
