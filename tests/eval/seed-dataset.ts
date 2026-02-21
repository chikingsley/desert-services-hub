/**
 * Seed the eval dataset from existing linked emails.
 *
 * Generates BEIR-format files:
 *   corpus.jsonl  — all projects
 *   queries.jsonl — sampled linked emails
 *   qrels.tsv    — ground truth (query → project)
 *
 * Usage: bun run tests/eval/seed-dataset.ts [--count 500]
 */
import { db } from "@lib/db/client";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dirname ?? join(process.cwd(), "tests/eval");
const SAMPLE_COUNT = Number(
  process.argv.includes("--count")
    ? process.argv[process.argv.indexOf("--count") + 1]
    : 500,
);

async function main() {
  console.log(`Seeding eval dataset with ${SAMPLE_COUNT} queries...`);

  // 1. Corpus: all projects
  console.log("Fetching projects...");
  const projects = await db
    .query<{ id: number; name: string; address: string | null; lifecycle_state: string }>(
      "SELECT id, name, address, lifecycle_state FROM projects ORDER BY id",
    )
    .all();

  console.log(`  ${projects.length} projects`);

  // 2. Sample linked emails — stratified: max 3 per project for diversity
  console.log("Sampling linked emails...");
  const emails = await db
    .query<{
      id: number;
      subject: string;
      body_preview: string | null;
      from_name: string | null;
      from_email: string | null;
      project_id: number;
      received_at: string;
    }>(
      `SELECT id, subject, body_preview, from_name, from_email, project_id, received_at
       FROM emails
       WHERE project_id IS NOT NULL AND subject IS NOT NULL
       ORDER BY received_at DESC
       LIMIT $1`,
    )
    .all(SAMPLE_COUNT * 3);

  if (emails.length === 0) {
    console.error("No linked emails found!");
    process.exit(1);
  }

  // Stratify: max 3 emails per project
  const perProject = new Map<number, typeof emails>();
  for (const e of emails) {
    const list = perProject.get(e.project_id) ?? [];
    if (list.length < 3) {
      list.push(e);
      perProject.set(e.project_id, list);
    }
  }

  // Flatten, shuffle, take SAMPLE_COUNT
  const pool = [...perProject.values()].flat();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sampled = pool.slice(0, SAMPLE_COUNT);

  console.log(
    `  ${sampled.length} emails sampled across ${new Set(sampled.map((e) => e.project_id)).size} projects`,
  );

  // 3. Write corpus.jsonl
  const corpusPath = join(DIR, "corpus.jsonl");
  writeFileSync(
    corpusPath,
    projects
      .map((p) =>
        JSON.stringify({
          _id: `proj_${p.id}`,
          title: p.name ?? "",
          text: [p.name, p.address, p.lifecycle_state]
            .filter(Boolean)
            .join(" | "),
        }),
      )
      .join("\n") + "\n",
  );
  console.log(`  Wrote ${corpusPath}`);

  // 4. Write queries.jsonl
  const queriesPath = join(DIR, "queries.jsonl");
  const queries = sampled.map((e) => ({
    _id: `q_${e.id}`,
    text: [e.subject, e.body_preview].filter(Boolean).join(" "),
    metadata: {
      source: "email",
      subject: e.subject,
      from_name: e.from_name,
      from_email: e.from_email,
      email_id: e.id,
    },
  }));
  writeFileSync(
    queriesPath,
    queries.map((q) => JSON.stringify(q)).join("\n") + "\n",
  );
  console.log(`  Wrote ${queriesPath}`);

  // 5. Write qrels.tsv
  const qrelsPath = join(DIR, "qrels.tsv");
  const qrelsLines = ["query-id\tcorpus-id\tscore"];
  for (const e of sampled) {
    qrelsLines.push(`q_${e.id}\tproj_${e.project_id}\t1`);
  }
  writeFileSync(qrelsPath, qrelsLines.join("\n") + "\n");
  console.log(`  Wrote ${qrelsPath}`);

  console.log("\nDone. Run eval with: bun run tests/eval/eval.ts");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
