/**
 * Build Accounts from Email Domains
 *
 * Extracts unique domains from emails, creates account records,
 * and links emails to their accounts.
 */
import {
  type AccountType,
  createAccount,
  db,
  getAllAccounts,
  updateAccountCounts,
} from "./db";

// Domains to skip (internal, platforms, noise)
const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "cmitsolutions.com",
  "monday.com",
  "microsoft.com",
  "office365.com",
  "avanan-mail.net",
]);

// Platform domains - emails go to projects, not separate accounts
const PLATFORM_DOMAINS = new Set([
  "maricopa.gov", // dust permits
  "pointandpay.com", // permit payments
  "buildingconnected.com", // RFPs/bids
  "docusign.net", // contracts
  "us02.procoretech.com", // procore
  "procoretech.com",
  "siteline.com", // billing
  "autodesk.com",
  "signin.autodesk.com",
  "salesforce.com",
  "fleetbase.io",
  "crosoftware.com",
  "fieldmotion.com",
]);

// Known contractor domain -> name mappings
const KNOWN_CONTRACTORS: Record<string, string> = {
  "fclbuilders.com": "FCL Builders",
  "holder.com": "Holder Construction",
  "arco1.com": "ARCO",
  "bprcompanies.com": "BPR Companies",
  "weisbuilders.com": "Weis Builders",
  "sundt.com": "Sundt",
  "nrpgroup.com": "NRP Group",
  "lgedesignbuild.com": "LGE Design Build",
  "armays.com": "Armays",
  "upwindcompanies.com": "Upwind Companies",
  "tlwconstruction.com": "TLW Construction",
  "laytonconstruction.com": "Layton Construction",
  "ganemcompanies.com": "Ganem Companies",
  "nfccontractinggroup.com": "NFC Contracting",
  "mycon.com": "MYCON",
  "eosbuilders.com": "EOS Builders",
  "embrey.com": "Embrey",
  "calienteconstruction.com": "Caliente Construction",
  "johanseninteriors.com": "Johansen Interiors",
  "stevensleinweber.com": "Stevens Leinweber",
  "pwiconstruction.com": "PWI Construction",
  "idmbuilds.com": "IDM Builds",
  "sunstonetwotree.com": "Sunstone Two Tree",
  "lorconstruction.com": "LOR Construction",
  "catamountinc.com": "Catamount",
  "woodpartners.com": "Wood Partners",
  "dsquarellc.com": "D Square",
  "meadhunt.com": "Mead & Hunt",
};

interface DomainStats {
  domain: string;
  emailCount: number;
  uniqueSenders: number;
  sampleName: string | null;
}

/**
 * Extract all unique external domains with stats
 */
function extractDomains(): DomainStats[] {
  const rows = db
    .query<{ domain: string; email_count: number; unique_senders: number }, []>(
      `
      SELECT
        LOWER(SUBSTR(from_email, INSTR(from_email, '@') + 1)) as domain,
        COUNT(*) as email_count,
        COUNT(DISTINCT from_email) as unique_senders
      FROM emails
      WHERE from_email IS NOT NULL
        AND from_email != ''
        AND from_email NOT LIKE '%desertservices.net%'
      GROUP BY domain
      HAVING email_count >= 2
      ORDER BY email_count DESC
    `
    )
    .all();

  return rows.map((r) => {
    // Get a sample sender name for this domain
    const sample = db
      .query<{ from_name: string | null }, [string]>(
        `SELECT from_name FROM emails
         WHERE from_email LIKE '%' || ?
         AND from_name IS NOT NULL AND from_name != ''
         LIMIT 1`
      )
      .get(r.domain);

    return {
      domain: r.domain,
      emailCount: r.email_count,
      uniqueSenders: r.unique_senders,
      sampleName: sample?.from_name ?? null,
    };
  });
}

/**
 * Determine account type for a domain
 */
function getDomainType(domain: string): AccountType | null {
  if (INTERNAL_DOMAINS.has(domain)) {
    return "internal";
  }
  if (PLATFORM_DOMAINS.has(domain)) {
    return "platform";
  }
  return "contractor";
}

/**
 * Get a readable name for a domain
 */
function getDomainName(domain: string, sampleName: string | null): string {
  // Check known contractors first
  if (KNOWN_CONTRACTORS[domain]) {
    return KNOWN_CONTRACTORS[domain];
  }

  // Try to extract company name from sample sender name
  if (sampleName) {
    // Remove personal name patterns like "John Smith (Company Name)"
    const parenMatch = sampleName.match(/\(([^)]+)\)/);
    if (parenMatch) {
      return parenMatch[1];
    }

    // If it's just a company name (no spaces or starts with company-like words)
    if (!sampleName.includes(" ") || sampleName.match(/^(The |LLC|Inc|Corp)/)) {
      return sampleName;
    }
  }

  // Fall back to domain-based name
  const baseName = domain.split(".")[0];
  return baseName.charAt(0).toUpperCase() + baseName.slice(1);
}

/**
 * Build accounts from email domains
 */
export function buildAccounts(): void {
  console.log("Extracting domains from emails...\n");

  const domains = extractDomains();
  console.log(`Found ${domains.length} unique external domains\n`);

  let contractors = 0;
  let platforms = 0;
  let internal = 0;

  for (const d of domains) {
    const type = getDomainType(d.domain);

    if (type === "internal") {
      internal++;
      continue;
    }

    if (type === "platform") {
      // Create as platform but don't count as contractor
      const name = getDomainName(d.domain, d.sampleName);
      createAccount(d.domain, name, "platform");
      platforms++;
      continue;
    }

    // Contractor account
    const name = getDomainName(d.domain, d.sampleName);
    createAccount(d.domain, name, "contractor");
    contractors++;

    console.log(`[ACCOUNT] ${name} (${d.domain}) - ${d.emailCount} emails`);
  }

  console.log("\n--- Summary ---");
  console.log(`Contractor accounts: ${contractors}`);
  console.log(`Platform accounts: ${platforms}`);
  console.log(`Internal (skipped): ${internal}`);
}

/**
 * Link emails to their accounts based on sender domain
 */
export function linkEmailsToAccounts(): void {
  console.log("\nLinking emails to accounts...\n");

  // Get all contractor accounts
  const accounts = getAllAccounts("contractor");
  const platformAccounts = getAllAccounts("platform");
  const allAccounts = [...accounts, ...platformAccounts];

  let linked = 0;

  for (const account of allAccounts) {
    // Update emails from this domain
    db.run(
      `UPDATE emails
       SET account_id = ?
       WHERE LOWER(SUBSTR(from_email, INSTR(from_email, '@') + 1)) = ?`,
      [account.id, account.domain]
    );

    const count = db
      .query<{ cnt: number }, [number]>(
        "SELECT COUNT(*) as cnt FROM emails WHERE account_id = ?"
      )
      .get(account.id);

    if (count && count.cnt > 0) {
      linked += count.cnt;
      console.log(`  ${account.name}: ${count.cnt} emails linked`);
    }
  }

  // Update account counts
  updateAccountCounts();

  console.log(`\nTotal emails linked: ${linked}`);
}

/**
 * Show account summary
 */
export function showAccountSummary(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║          ACCOUNT SUMMARY             ║");
  console.log("╚══════════════════════════════════════╝\n");

  const contractors = getAllAccounts("contractor");
  const platforms = getAllAccounts("platform");

  console.log(`Contractor Accounts: ${contractors.length}`);
  console.log(`Platform Accounts: ${platforms.length}\n`);

  console.log("── Top Contractors ──");
  for (const a of contractors.slice(0, 20)) {
    console.log(`  ${a.name} (${a.domain}): ${a.emailCount} emails`);
  }

  if (platforms.length > 0) {
    console.log("\n── Platforms ──");
    for (const a of platforms) {
      console.log(`  ${a.name} (${a.domain}): ${a.emailCount} emails`);
    }
  }
}

// CLI
if (import.meta.main) {
  const cmd = process.argv[2] || "build";

  switch (cmd) {
    case "build":
      buildAccounts();
      linkEmailsToAccounts();
      showAccountSummary();
      break;
    case "link":
      linkEmailsToAccounts();
      break;
    case "summary":
      showAccountSummary();
      break;
    default:
      console.log(`
Usage: bun services/email/census/build-accounts.ts [command]

Commands:
  build    Extract domains, create accounts, link emails (default)
  link     Only link emails to existing accounts
  summary  Show account summary
`);
  }
}
