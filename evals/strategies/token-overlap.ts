/**
 * Baseline strategy: token-overlap matching on project names.
 * This replicates what the current triage pipeline does for candidate generation.
 */
import { db } from "@lib/db/client";
import type { RetrievalStrategy } from "./types";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "desert",
  "services",
  "project",
  "contract",
  "permit",
  "estimate",
  "llc",
  "inc",
  "corp",
  "company",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

interface ProjectRow {
  address: string | null;
  contractor: string | null;
  id: number;
  name: string;
}

let projectCache: ProjectRow[] = [];

const strategy: RetrievalStrategy = {
  async init() {
    // Load all projects into memory for fast scoring
    projectCache = await db
      .query<ProjectRow>(
        "SELECT id, name, address, contractor FROM projects ORDER BY id"
      )
      .all();
    console.log(`  Loaded ${projectCache.length} projects`);
  },

  async retrieve(query) {
    const queryTokens = new Set(tokenize(query.text));
    if (queryTokens.size === 0) {
      return [];
    }

    const scored: { id: number; score: number }[] = [];

    for (const project of projectCache) {
      let score = 0;
      const projectText = [project.name, project.address, project.contractor]
        .filter(Boolean)
        .join(" ");
      const projectTokens = new Set(tokenize(projectText));

      let overlap = 0;
      for (const token of queryTokens) {
        if (projectTokens.has(token)) {
          overlap++;
        }
      }

      if (overlap > 0) {
        score = Math.round(
          (overlap / Math.max(queryTokens.size, projectTokens.size)) * 100
        );
        scored.push({ id: project.id, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 20).map((s) => s.id);
  },

  async cleanup() {
    projectCache = [];
  },
};

export default strategy;
