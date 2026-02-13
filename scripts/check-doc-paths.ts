#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Finding = {
  doc: string;
  token: string;
  resolvedPath: string;
};

const repoRoot = process.cwd();
const repoAbsolutePrefix = `${repoRoot}/`;

const docFiles = [
  "AGENTS.md",
  ...Array.from(new Bun.Glob(".agents/skills/**/SKILL.md").scanSync()),
];

const allowedMissing = new Set<string>([
  "apps/workers/contract-intake/",
  "apps/workers/files-email-intake/",
  "apps/workers/dust-permit-intake/",
  "data/triage/1400-w-3rd/sssp-input.json",
  "data/sds/sds-input.json",
  "data/reports/contracts-pending.csv",
]);

const repoPathPrefixes = [
  "AGENTS.md",
  "CLAUDE.md",
  "SYSTEM-MAP.md",
  "README.md",
  "Justfile",
  "docker-compose.yml",
  "apps/",
  "lib/",
  "scripts/",
  "supabase/",
  "data/",
  "docs/",
  "tests/",
  "services/",
  "workers/",
  "ops/",
  ".agents/",
];

const ignoredTokenPrefixes = [
  "http://",
  "https://",
  "postgresql://",
  "docker",
  "bun",
  "just",
  "npx",
  "SELECT",
  "FROM",
  "WHERE",
  "/api/",
];

function normalizeToken(raw: string): string {
  let token = raw.trim();
  token = token.replace(/^['"]+|['"]+$/g, "");
  return token;
}

function isPathCandidate(token: string): boolean {
  if (!token) return false;
  if (/\s/.test(token)) return false;
  if (token.includes("*")) return false;
  if (token.includes("...")) return false;
  if (token.includes("<") || token.includes(">")) return false;
  if (token.includes("(") || token.includes(")")) return false;
  if (token.includes("@@")) return false;

  for (const prefix of ignoredTokenPrefixes) {
    if (token.startsWith(prefix)) return false;
  }

  if (token.startsWith(repoAbsolutePrefix)) return true;

  for (const prefix of repoPathPrefixes) {
    if (token.startsWith(prefix)) return true;
  }

  return false;
}

function resolveTokenPath(token: string): string | null {
  if (token.startsWith(repoAbsolutePrefix)) {
    return resolve(token);
  }

  return resolve(repoRoot, token);
}

function collectBacktickTokens(markdown: string): string[] {
  const tokens: string[] = [];
  const regex = /`([^`\n]+)`/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    tokens.push(match[1]);
  }

  return tokens;
}

const missing: Finding[] = [];
let checkedCount = 0;

for (const doc of docFiles) {
  if (!existsSync(doc)) {
    missing.push({ doc, token: doc, resolvedPath: resolve(repoRoot, doc) });
    continue;
  }

  const content = readFileSync(doc, "utf8");
  const tokens = collectBacktickTokens(content);

  for (const rawToken of tokens) {
    const token = normalizeToken(rawToken);
    if (!isPathCandidate(token)) continue;
    if (allowedMissing.has(token)) continue;

    const resolvedPath = resolveTokenPath(token);
    if (!resolvedPath) continue;

    checkedCount += 1;

    if (!existsSync(resolvedPath)) {
      missing.push({ doc, token, resolvedPath });
    }
  }
}

if (missing.length > 0) {
  console.error("doc path alignment check failed");
  for (const finding of missing) {
    console.error(`- ${finding.doc}: \`${finding.token}\` -> ${finding.resolvedPath}`);
  }
  process.exit(1);
}

console.log(`doc path alignment check passed (${checkedCount} references checked)`);
