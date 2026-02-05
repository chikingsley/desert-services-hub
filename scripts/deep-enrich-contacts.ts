#!/usr/bin/env bun

/**
 * Deep enrichment for contacts without contractor links
 *
 * Strategy:
 * 1. Match by email domain to existing accounts (high confidence)
 * 2. Search emails database for correspondence with contact
 * 3. Extract company names from email subjects, signatures
 * 4. Try to create new account recommendations
 */

import { Database } from "bun:sqlite";

const HUB_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract-ui/contract/hub.db";
const REPORT_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/contact-enrichment-report.md";

// Personal email domains to skip
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "live.com",
  "msn.com",
  "comcast.net",
  "cox.net",
  "att.net",
  "verizon.net",
  "sbcglobal.net",
  "protonmail.com",
  "ymail.com",
]);

// Desert Services internal domains
const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.us",
  "upwindcompanies.com",
]);

interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  group_title: string;
  imported_account_name: string | null;
}

interface Account {
  id: number;
  name: string;
  domain: string | null;
  monday_account_id: string | null;
}

interface EnrichmentResult {
  contactId: number;
  contactName: string;
  contactEmail: string | null;
  group: string;
  emailDomain: string | null;
  isPersonalEmail: boolean;
  matchedAccountId: number | null;
  matchedAccountName: string | null;
  matchMethod: string | null;
  confidence: "high" | "medium" | "low" | "none";
  recommendation: string;
  emailCount: number;
  sampleSubjects: string[];
  possibleCompanies: string[];
  createAccountRecommendation: string | null;
}

function extractDomain(email: string | null): string | null {
  if (!email) return null;
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b(inc|llc|corp|corporation|company|co|ltd|limited|group|construction|contracting|builders|homes)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function deepEnrichContacts(): Promise<void> {
  const db = new Database(HUB_DB_PATH, { readonly: true });

  // Get contacts without contractor links (excluding Insufficient Information)
  const contacts = db
    .query<Contact, []>(
      `
    SELECT id, name, email, phone, title, group_title, imported_account_name
    FROM contacts
    WHERE (contractor_monday_id IS NULL AND account_id IS NULL)
      AND group_title != 'Insufficient Information'
    ORDER BY group_title, name
  `
    )
    .all();

  console.log(`Found ${contacts.length} contacts to enrich\n`);

  // Get all accounts for matching
  const accounts = db
    .query<Account, []>(
      `
    SELECT id, name, domain, monday_account_id
    FROM accounts
  `
    )
    .all();

  // Build domain lookup map
  const domainToAccount = new Map<string, Account>();
  for (const account of accounts) {
    if (account.domain) {
      domainToAccount.set(account.domain.toLowerCase(), account);
    }
  }

  // Build normalized name lookup
  const normalizedNameToAccount = new Map<string, Account>();
  for (const account of accounts) {
    const normalized = normalizeCompanyName(account.name);
    if (normalized.length > 2) {
      normalizedNameToAccount.set(normalized, account);
    }
  }

  const results: EnrichmentResult[] = [];
  let processed = 0;

  for (const contact of contacts) {
    processed++;
    if (processed % 20 === 0) {
      console.log(`Processing ${processed}/${contacts.length}...`);
    }

    const domain = extractDomain(contact.email);
    const isPersonalEmail = domain ? PERSONAL_DOMAINS.has(domain) : false;
    const isInternalEmail = domain ? INTERNAL_DOMAINS.has(domain) : false;

    const result: EnrichmentResult = {
      contactId: contact.id,
      contactName: contact.name,
      contactEmail: contact.email,
      group: contact.group_title,
      emailDomain: domain,
      isPersonalEmail,
      matchedAccountId: null,
      matchedAccountName: null,
      matchMethod: null,
      confidence: "none",
      recommendation: "",
      emailCount: 0,
      sampleSubjects: [],
      possibleCompanies: [],
      createAccountRecommendation: null,
    };

    // Skip internal emails
    if (isInternalEmail) {
      result.recommendation = "Internal Desert Services email - skip";
      results.push(result);
      continue;
    }

    // 1. Try to match by email domain (highest confidence)
    if (domain && !isPersonalEmail) {
      const accountByDomain = domainToAccount.get(domain);
      if (accountByDomain) {
        result.matchedAccountId = accountByDomain.id;
        result.matchedAccountName = accountByDomain.name;
        result.matchMethod = "email_domain";
        result.confidence = "high";
        result.recommendation = `Link to "${accountByDomain.name}" (ID: ${accountByDomain.id})`;
        results.push(result);
        continue;
      }
    }

    // 2. Try to match by imported_account_name
    if (contact.imported_account_name) {
      const normalized = normalizeCompanyName(contact.imported_account_name);
      const accountByName = normalizedNameToAccount.get(normalized);
      if (accountByName) {
        result.matchedAccountId = accountByName.id;
        result.matchedAccountName = accountByName.name;
        result.matchMethod = "imported_name";
        result.confidence = "high";
        result.recommendation = `Link to "${accountByName.name}" (ID: ${accountByName.id}) - imported as "${contact.imported_account_name}"`;
        results.push(result);
        continue;
      }
      result.possibleCompanies.push(contact.imported_account_name);
    }

    // 3. Search emails for this contact
    if (contact.email) {
      // Find emails sent by this contact
      const emailsFromContact = db
        .query<{ subject: string; body_preview: string | null }, [string]>(
          `
        SELECT subject, body_preview
        FROM emails
        WHERE from_email = ?
        ORDER BY received_at DESC
        LIMIT 10
      `
        )
        .all(contact.email);

      // Find emails mentioning contact's name in subject
      const firstName = contact.name.split(" ")[0];
      const emailsMentioning = db
        .query<{ subject: string; body_preview: string | null }, [string]>(
          `
        SELECT subject, body_preview
        FROM emails
        WHERE subject LIKE '%' || ? || '%'
        ORDER BY received_at DESC
        LIMIT 5
      `
        )
        .all(firstName);

      result.emailCount = emailsFromContact.length + emailsMentioning.length;
      result.sampleSubjects = [
        ...emailsFromContact.map((e) => e.subject),
        ...emailsMentioning.map((e) => e.subject),
      ].slice(0, 5);

      // Try to extract company from email signatures/body
      for (const email of emailsFromContact) {
        if (email.body_preview) {
          // Look for company patterns in signature
          // Common: "Name | Company" or "Name, Company" or after newlines
          const lines = email.body_preview.split(/[\n\r]+/);
          for (const line of lines) {
            // Skip very long lines (probably paragraphs)
            if (line.length > 100) continue;
            // Look for company-like patterns
            if (
              line.includes("|") ||
              line.includes(",") ||
              line.match(/\b(Inc|LLC|Corp|Construction|Builders)\b/i)
            ) {
              const cleaned = line.replace(/[<>[\]]/g, "").trim();
              if (cleaned.length > 3 && cleaned.length < 80) {
                result.possibleCompanies.push(cleaned);
              }
            }
          }
        }
      }
    }

    // 4. Try to match domain to company name if work email
    if (domain && !isPersonalEmail) {
      // Extract company name from domain (e.g., "brinkmannconstructors.com" -> "brinkmann")
      const domainParts = domain.split(".");
      const mainPart = domainParts[0];
      if (mainPart.length > 3) {
        // Try to find account with similar name
        for (const [normalizedName, account] of normalizedNameToAccount) {
          if (
            normalizedName.includes(mainPart) ||
            mainPart.includes(normalizedName.split(" ")[0])
          ) {
            result.matchedAccountId = account.id;
            result.matchedAccountName = account.name;
            result.matchMethod = "domain_name_match";
            result.confidence = "medium";
            result.recommendation = `Likely link to "${account.name}" (ID: ${account.id}) - domain "${domain}" matches`;
            break;
          }
        }
      }

      // If no match found but has work email, recommend creating account
      if (!result.matchedAccountId) {
        result.createAccountRecommendation = `Create account for domain "${domain}"`;
        result.confidence = "low";
        result.recommendation = `Work email domain "${domain}" - may need new account`;
      }
    }

    // 5. Final recommendation for personal emails
    if (isPersonalEmail && !result.matchedAccountId) {
      if (result.possibleCompanies.length > 0) {
        result.recommendation = `Personal email - possible companies: ${result.possibleCompanies.slice(0, 3).join(", ")}`;
        result.confidence = "low";
      } else {
        result.recommendation = "Personal email - needs PDL enrichment";
        result.confidence = "none";
      }
    }

    // If no recommendation yet
    if (!result.recommendation) {
      result.recommendation = "No clear match - needs manual review";
    }

    results.push(result);
  }

  db.close();

  // Generate comprehensive report
  await generateReport(results);

  console.log(`\nEnrichment complete. Report saved to: ${REPORT_PATH}`);
}

async function generateReport(results: EnrichmentResult[]): Promise<void> {
  const highConfidence = results.filter((r) => r.confidence === "high");
  const mediumConfidence = results.filter((r) => r.confidence === "medium");
  const lowConfidence = results.filter((r) => r.confidence === "low");
  const noMatch = results.filter((r) => r.confidence === "none");
  const internal = results.filter((r) =>
    r.recommendation.includes("Internal Desert Services")
  );

  let report = `# Contact Enrichment Report

Generated: ${new Date().toISOString()}

## Executive Summary

| Category | Count | Action |
|----------|-------|--------|
| High Confidence | ${highConfidence.length} | Ready to link |
| Medium Confidence | ${mediumConfidence.length} | Review then link |
| Low Confidence | ${lowConfidence.length} | Manual verification needed |
| No Match | ${noMatch.length} | PDL enrichment or manual research |
| Internal Emails | ${internal.length} | Skip (Desert Services staff) |
| **Total** | **${results.length}** | |

---

## High Confidence Matches (${highConfidence.length})

These can be linked immediately:

\`\`\`bash
cd workers/ds-estimates-sync-worker
`;

  for (const r of highConfidence) {
    report += `bun cli/hub.ts link contact ${r.contactId} --account=${r.matchedAccountId}  # ${r.contactName} → ${r.matchedAccountName}\n`;
  }

  report += `\`\`\`

| ID | Name | Email | Account | Method |
|----|------|-------|---------|--------|
`;

  for (const r of highConfidence) {
    report += `| ${r.contactId} | ${r.contactName} | ${r.contactEmail ?? "—"} | ${r.matchedAccountName} (${r.matchedAccountId}) | ${r.matchMethod} |\n`;
  }

  report += `

---

## Medium Confidence Matches (${mediumConfidence.length})

Review these before linking:

| ID | Name | Email | Suggested Account | Method | Notes |
|----|------|-------|-------------------|--------|-------|
`;

  for (const r of mediumConfidence) {
    report += `| ${r.contactId} | ${r.contactName} | ${r.contactEmail ?? "—"} | ${r.matchedAccountName} (${r.matchedAccountId}) | ${r.matchMethod} | ${r.recommendation} |\n`;
  }

  if (mediumConfidence.length > 0) {
    report += `
### Commands (after review):

\`\`\`bash
cd workers/ds-estimates-sync-worker
`;
    for (const r of mediumConfidence) {
      report += `# ${r.contactName}: ${r.recommendation}\nbun cli/hub.ts link contact ${r.contactId} --account=${r.matchedAccountId}\n`;
    }
    report += `\`\`\`
`;
  }

  report += `

---

## Low Confidence / Work Emails Without Account (${lowConfidence.length})

These have work email domains but no matching account:

| ID | Name | Email | Domain | Possible Companies | Emails Found |
|----|------|-------|--------|-------------------|--------------|
`;

  const workEmailsNoAccount = lowConfidence.filter(
    (r) => !r.isPersonalEmail && r.emailDomain
  );
  const personalWithClues = lowConfidence.filter(
    (r) => r.isPersonalEmail || !r.emailDomain
  );

  for (const r of workEmailsNoAccount) {
    report += `| ${r.contactId} | ${r.contactName} | ${r.contactEmail ?? "—"} | ${r.emailDomain} | ${r.possibleCompanies.slice(0, 2).join("; ") || "—"} | ${r.emailCount} |\n`;
  }

  if (workEmailsNoAccount.length > 0) {
    report += `
### Recommended New Accounts

These domains need new accounts created:

`;
    const seenDomains = new Set<string>();
    for (const r of workEmailsNoAccount) {
      if (r.emailDomain && !seenDomains.has(r.emailDomain)) {
        seenDomains.add(r.emailDomain);
        const contactsWithDomain = workEmailsNoAccount.filter(
          (c) => c.emailDomain === r.emailDomain
        );
        report += `- **${r.emailDomain}** (${contactsWithDomain.length} contacts)\n`;
      }
    }
  }

  if (personalWithClues.length > 0) {
    report += `
### Personal Emails With Clues

`;
    for (const r of personalWithClues) {
      if (r.possibleCompanies.length > 0) {
        report += `- **${r.contactName}** (ID: ${r.contactId}) - ${r.contactEmail}\n`;
        report += `  - Possible: ${r.possibleCompanies.slice(0, 3).join(", ")}\n`;
      }
    }
  }

  report += `

---

## No Match - Needs PDL Enrichment (${noMatch.length})

These have personal email addresses and no company clues:

`;

  for (const r of noMatch) {
    if (!r.recommendation.includes("Internal")) {
      report += `- **${r.contactName}** (ID: ${r.contactId}) - ${r.contactEmail ?? "no email"} - Group: ${r.group}\n`;
    }
  }

  report += `

### PDL Enrichment Command

\`\`\`bash
# Contact IDs for PDL batch enrichment:
# ${noMatch
    .filter((r) => !r.recommendation.includes("Internal"))
    .map((r) => r.contactId)
    .join(", ")}
\`\`\`

---

## Internal Desert Services Contacts (${internal.length})

These are internal staff and should be skipped:

`;

  for (const r of internal) {
    report += `- ${r.contactName} (ID: ${r.contactId}) - ${r.contactEmail}\n`;
  }

  report += `

---

## Next Steps

1. **Run high-confidence links** (${highConfidence.length} contacts)
2. **Review medium-confidence** (${mediumConfidence.length} contacts)
3. **Create accounts for work domains** (${workEmailsNoAccount.length} contacts)
4. **Run PDL enrichment** for ${noMatch.filter((r) => !r.recommendation.includes("Internal")).length} personal emails
5. **Move internal contacts** to appropriate group

## Raw Data

Full results exported to: contact-enrichment-report.md
`;

  await Bun.write(REPORT_PATH, report);
}

// Run
deepEnrichContacts().catch(console.error);
