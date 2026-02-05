#!/usr/bin/env bun
/**
 * Validate email-project linking quality.
 * Checks that linked emails are actually relevant to the project.
 *
 * Usage: bun validate-links.ts --project-id=123
 *        bun validate-links.ts --all
 */

import Database from "bun:sqlite";

// Top-level regex for splitting words
const WORD_SPLIT_REGEX = /[^a-z0-9]+/;

const projectIdArg = process.argv.find((a) => a.startsWith("--project-id="));
const validateAll = process.argv.includes("--all");
const verbose = process.argv.includes("--verbose");

if (!(projectIdArg || validateAll)) {
  console.error("Usage: bun validate-links.ts --project-id=123 [--verbose]");
  console.error("       bun validate-links.ts --all [--verbose]");
  process.exit(1);
}

const db = new Database("./apps/contract-ui/contract/hub.db");

interface ProjectRow {
  id: number;
  name: string;
}
interface EmailRow {
  id: number;
  subject: string;
  from_email: string;
  from_domain: string | null;
}
interface CountRow {
  c: number;
}
interface DomainCountRow {
  from_domain: string | null;
  c: number;
}

function validateProject(projectId: number): {
  pass: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  const project = db
    .query<ProjectRow, [number]>("SELECT id, name FROM projects WHERE id = ?")
    .get(projectId);

  if (!project) {
    return { pass: false, issues: ["Project not found"] };
  }

  // Get keywords from project name (words > 3 chars)
  const keywords = project.name
    .toLowerCase()
    .split(WORD_SPLIT_REGEX)
    .filter((w) => w.length > 3);

  // Also get keywords from aliases
  const aliases = db
    .query<{ alias: string }, [number]>(
      "SELECT alias FROM project_aliases WHERE project_id = ?"
    )
    .all(projectId);

  for (const a of aliases) {
    const aliasKeywords = a.alias
      .toLowerCase()
      .split(WORD_SPLIT_REGEX)
      .filter((w) => w.length > 3);
    keywords.push(...aliasKeywords);
  }

  // Add common abbreviations
  if (keywords.includes("paradise") && keywords.includes("valley")) {
    keywords.push("pv");
  }

  // Get linked emails
  const emails = db
    .query<EmailRow, [number]>(
      "SELECT id, subject, from_email, from_domain FROM emails WHERE project_id = ?"
    )
    .all(projectId);

  if (emails.length === 0) {
    return { pass: false, issues: ["No emails linked"] };
  }

  // Check 1: Subject relevance
  let matchingSubjects = 0;
  const unmatchedEmails: EmailRow[] = [];

  for (const email of emails) {
    const subjectLower = email.subject.toLowerCase();
    const hasKeyword = keywords.some((kw) => subjectLower.includes(kw));
    if (hasKeyword) {
      matchingSubjects++;
    } else {
      unmatchedEmails.push(email);
    }
  }

  const subjectRelevance = matchingSubjects / emails.length;
  if (subjectRelevance < 0.3) {
    issues.push(
      `Low subject relevance: ${(subjectRelevance * 100).toFixed(1)}% ` +
        `(${matchingSubjects}/${emails.length} match keywords: ${keywords.join(", ")})`
    );
  }

  // Check 2: Domain distribution
  const domainCounts = db
    .query<DomainCountRow, [number]>(
      `SELECT from_domain, COUNT(*) as c 
       FROM emails WHERE project_id = ? 
       GROUP BY from_domain ORDER BY c DESC`
    )
    .all(projectId);

  const internalDomain = "desertservices.net";
  const internalCount =
    domainCounts.find((d) => d.from_domain === internalDomain)?.c || 0;
  const externalDomains = domainCounts.filter(
    (d) => d.from_domain !== internalDomain
  );

  if (externalDomains.length > 5 && internalCount < emails.length * 0.3) {
    issues.push(
      `Unusual domain distribution: ${externalDomains.length} external domains, ` +
        `only ${((internalCount / emails.length) * 100).toFixed(1)}% internal`
    );
  }

  // Check 3: Random sample manual verification
  if (verbose && unmatchedEmails.length > 0) {
    const sample = unmatchedEmails.slice(0, 5);
    console.log("\n  Emails without keyword matches:");
    for (const email of sample) {
      console.log(`    - "${email.subject}" from ${email.from_email}`);
    }
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

if (validateAll) {
  console.log("Validating all projects with linked emails...\n");

  const projectsWithEmails = db
    .query<{ project_id: number }, []>(
      "SELECT DISTINCT project_id FROM emails WHERE project_id IS NOT NULL"
    )
    .all();

  let passed = 0;
  let failed = 0;

  for (const row of projectsWithEmails) {
    const project = db
      .query<ProjectRow, [number]>("SELECT id, name FROM projects WHERE id = ?")
      .get(row.project_id);

    const emailCount = db
      .query<CountRow, [number]>(
        "SELECT COUNT(*) as c FROM emails WHERE project_id = ?"
      )
      .get(row.project_id);

    const result = validateProject(row.project_id);

    if (result.pass) {
      console.log(`✓ ${project?.name} (${emailCount?.c} emails)`);
      passed++;
    } else {
      console.log(`✗ ${project?.name} (${emailCount?.c} emails)`);
      for (const issue of result.issues) {
        console.log(`  - ${issue}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
} else {
  const projectId = Number(projectIdArg?.split("=")[1]);
  const project = db
    .query<ProjectRow, [number]>("SELECT id, name FROM projects WHERE id = ?")
    .get(projectId);

  console.log(`Validating: ${project?.name} (ID: ${projectId})\n`);

  const result = validateProject(projectId);

  if (result.pass) {
    console.log("✓ PASSED");
  } else {
    console.log("✗ FAILED");
    for (const issue of result.issues) {
      console.log(`  - ${issue}`);
    }
  }
}

db.close();
