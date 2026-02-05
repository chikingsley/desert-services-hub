#!/usr/bin/env bun

/**
 * Enrich contacts without contractor links
 *
 * For each contact:
 * 1. Search emails by name/email to find company context
 * 2. Try to match email domain to existing accounts
 * 3. Search imported_account_name against accounts
 * 4. Log findings for review
 */

import { Database } from "bun:sqlite";

const HUB_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract-ui/contract/hub.db";
const REPORT_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/contact-enrichment-report.md";

// Domains to skip (personal email providers)
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

interface EmailMatch {
  id: number;
  subject: string;
  from_email: string;
  from_name: string | null;
  received_at: string;
  body_preview: string | null;
}

interface EnrichmentResult {
  contact: Contact;
  emailDomain: string | null;
  isPersonalEmail: boolean;
  matchedAccount: Account | null;
  matchMethod: string | null;
  emailsFound: number;
  sampleEmails: EmailMatch[];
  recommendation: string;
  confidence: "high" | "medium" | "low" | "none";
}

function extractDomain(email: string | null): string | null {
  if (!email) return null;
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function enrichContacts(): Promise<void> {
  const db = new Database(HUB_DB_PATH, { readonly: true });

  // Get contacts without contractor links (excluding Insufficient Information)
  const contacts = db
    .query<Contact, []>(`
    SELECT id, name, email, phone, title, group_title, imported_account_name
    FROM contacts
    WHERE (contractor_monday_id IS NULL AND account_id IS NULL)
      AND group_title != 'Insufficient Information'
    ORDER BY group_title, name
  `)
    .all();

  console.log(`Found ${contacts.length} contacts to enrich\n`);

  // Get all accounts for matching
  const accounts = db
    .query<Account, []>(`
    SELECT id, name, domain, monday_account_id
    FROM accounts
    WHERE domain IS NOT NULL AND domain != ''
  `)
    .all();

  // Build domain lookup map
  const domainToAccount = new Map<string, Account>();
  for (const account of accounts) {
    if (account.domain) {
      domainToAccount.set(account.domain.toLowerCase(), account);
    }
  }

  // Build name lookup (normalized)
  const nameToAccount = new Map<string, Account>();
  for (const account of accounts) {
    const normalized = normalizeForSearch(account.name);
    nameToAccount.set(normalized, account);
    // Also try first word (company name without suffix)
    const firstWord = normalized.split(" ")[0];
    if (firstWord.length > 3 && !nameToAccount.has(firstWord)) {
      nameToAccount.set(firstWord, account);
    }
  }

  const results: EnrichmentResult[] = [];
  let processed = 0;

  for (const contact of contacts) {
    processed++;
    if (processed % 20 === 0) {
      console.log(`Processing ${processed}/${contacts.length}...`);
    }

    const result: EnrichmentResult = {
      contact,
      emailDomain: null,
      isPersonalEmail: false,
      matchedAccount: null,
      matchMethod: null,
      emailsFound: 0,
      sampleEmails: [],
      recommendation: "",
      confidence: "none",
    };

    // 1. Check email domain
    const domain = extractDomain(contact.email);
    result.emailDomain = domain;
    result.isPersonalEmail = domain ? PERSONAL_DOMAINS.has(domain) : false;

    // 2. Try to match by email domain
    if (domain && !result.isPersonalEmail) {
      const accountByDomain = domainToAccount.get(domain);
      if (accountByDomain) {
        result.matchedAccount = accountByDomain;
        result.matchMethod = "email_domain";
        result.confidence = "high";
        result.recommendation = `Link to account "${accountByDomain.name}" (ID: ${accountByDomain.id}) - matched by email domain`;
      }
    }

    // 3. Try to match by imported_account_name
    if (!result.matchedAccount && contact.imported_account_name) {
      const normalized = normalizeForSearch(contact.imported_account_name);
      const accountByName = nameToAccount.get(normalized);
      if (accountByName) {
        result.matchedAccount = accountByName;
        result.matchMethod = "imported_name_exact";
        result.confidence = "high";
        result.recommendation = `Link to account "${accountByName.name}" (ID: ${accountByName.id}) - matched by imported account name`;
      } else {
        // Try fuzzy match on first significant word
        const words = normalized.split(" ").filter((w) => w.length > 3);
        for (const word of words) {
          const fuzzyMatch = nameToAccount.get(word);
          if (fuzzyMatch) {
            result.matchedAccount = fuzzyMatch;
            result.matchMethod = "imported_name_fuzzy";
            result.confidence = "medium";
            result.recommendation = `Possibly link to account "${fuzzyMatch.name}" (ID: ${fuzzyMatch.id}) - fuzzy match on "${word}"`;
            break;
          }
        }
      }
    }

    // 4. Search emails for context
    if (contact.email) {
      const emailMatches = db
        .query<EmailMatch, [string]>(`
        SELECT id, subject, from_email, from_name, received_at, body_preview
        FROM emails
        WHERE from_email = ? OR subject LIKE '%' || ? || '%'
        ORDER BY received_at DESC
        LIMIT 5
      `)
        .all(contact.email, contact.name.split(" ")[0]);

      result.emailsFound = emailMatches.length;
      result.sampleEmails = emailMatches;

      // Try to extract company from email signatures or context
      if (emailMatches.length > 0 && !result.matchedAccount) {
        // Look for company patterns in body preview
        for (const email of emailMatches) {
          if (email.body_preview) {
            // Common patterns: "Company Name | Title" or "From: Name, Company"
            const preview = email.body_preview;

            // Try to find company mentions
            for (const [, account] of nameToAccount) {
              if (
                preview
                  .toLowerCase()
                  .includes(account.name.toLowerCase().split(" ")[0])
              ) {
                result.matchedAccount = account;
                result.matchMethod = "email_body_mention";
                result.confidence = "low";
                result.recommendation = `Review: possible link to "${account.name}" - found in email body`;
                break;
              }
            }
            if (result.matchedAccount) break;
          }
        }
      }
    }

    // 5. Set final recommendation
    if (!result.matchedAccount) {
      if (result.isPersonalEmail) {
        result.recommendation =
          "Personal email domain - may need manual research or PDL enrichment";
        result.confidence = "none";
      } else if (result.emailsFound > 0) {
        result.recommendation =
          "Has email history - review emails for company context";
        result.confidence = "low";
      } else {
        result.recommendation = "No matches found - needs manual research";
        result.confidence = "none";
      }
    }

    results.push(result);
  }

  db.close();

  // Generate report
  await generateReport(results);

  console.log(`\nEnrichment complete. Report saved to: ${REPORT_PATH}`);
}

async function generateReport(results: EnrichmentResult[]): Promise<void> {
  const highConfidence = results.filter((r) => r.confidence === "high");
  const mediumConfidence = results.filter((r) => r.confidence === "medium");
  const lowConfidence = results.filter((r) => r.confidence === "low");
  const noMatch = results.filter((r) => r.confidence === "none");

  let report = `# Contact Enrichment Report

Generated: ${new Date().toISOString()}

## Summary

- **Total contacts processed:** ${results.length}
- **High confidence matches:** ${highConfidence.length} (ready to link)
- **Medium confidence matches:** ${mediumConfidence.length} (review recommended)
- **Low confidence matches:** ${lowConfidence.length} (needs verification)
- **No matches:** ${noMatch.length} (needs manual research)

---

## High Confidence Matches (${highConfidence.length})

These can be linked directly:

| Contact ID | Name | Email | Match Method | Account to Link |
|------------|------|-------|--------------|-----------------|
`;

  for (const r of highConfidence) {
    report += `| ${r.contact.id} | ${r.contact.name} | ${r.contact.email ?? "—"} | ${r.matchMethod} | ${r.matchedAccount?.name} (ID: ${r.matchedAccount?.id}) |\n`;
  }

  report += `

---

## Medium Confidence Matches (${mediumConfidence.length})

Review these before linking:

| Contact ID | Name | Email | Match Method | Suggested Account | Notes |
|------------|------|-------|--------------|-------------------|-------|
`;

  for (const r of mediumConfidence) {
    report += `| ${r.contact.id} | ${r.contact.name} | ${r.contact.email ?? "—"} | ${r.matchMethod} | ${r.matchedAccount?.name} (ID: ${r.matchedAccount?.id}) | ${r.recommendation} |\n`;
  }

  report += `

---

## Low Confidence / Needs Review (${lowConfidence.length})

These need manual verification:

`;

  for (const r of lowConfidence) {
    report += `### ${r.contact.name} (ID: ${r.contact.id})
- **Email:** ${r.contact.email ?? "—"}
- **Group:** ${r.contact.group_title}
- **Imported Account:** ${r.contact.imported_account_name ?? "—"}
- **Recommendation:** ${r.recommendation}
- **Emails Found:** ${r.emailsFound}

`;
    if (r.sampleEmails.length > 0) {
      report += "**Sample Emails:**\n";
      for (const email of r.sampleEmails.slice(0, 3)) {
        report += `- ${email.received_at}: "${email.subject}" from ${email.from_email}\n`;
      }
      report += "\n";
    }
  }

  report += `

---

## No Matches Found (${noMatch.length})

These need manual research or PDL enrichment:

### Personal Email Addresses (likely need PDL)

`;

  const personalEmails = noMatch.filter((r) => r.isPersonalEmail);
  const otherNoMatch = noMatch.filter((r) => !r.isPersonalEmail);

  for (const r of personalEmails) {
    report += `- **${r.contact.name}** (ID: ${r.contact.id}) - ${r.contact.email} - Group: ${r.contact.group_title}\n`;
  }

  report += `

### Other No Matches

`;

  for (const r of otherNoMatch) {
    report += `- **${r.contact.name}** (ID: ${r.contact.id}) - ${r.contact.email ?? "no email"} - Group: ${r.contact.group_title}`;
    if (r.contact.imported_account_name) {
      report += ` - Imported: "${r.contact.imported_account_name}"`;
    }
    report += "\n";
  }

  report += `

---

## Quick Actions

### Link High Confidence Matches

\`\`\`bash
# Run these commands to link high-confidence matches:
cd workers/ds-estimates-sync-worker
`;

  for (const r of highConfidence) {
    if (r.matchedAccount) {
      report += `bun cli/hub.ts link contact ${r.contact.id} --account=${r.matchedAccount.id}\n`;
    }
  }

  report += `\`\`\`

### Contacts Needing PDL Enrichment

${personalEmails.length} contacts have personal email addresses and may benefit from PDL enrichment to find their company affiliation.

Contact IDs: ${personalEmails.map((r) => r.contact.id).join(", ")}
`;

  await Bun.write(REPORT_PATH, report);
}

// Run
enrichContacts().catch(console.error);
