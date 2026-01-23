/**
 * Link Payment Emails to Projects
 *
 * Matches pointandpay payment emails to permits via invoice number,
 * then links them to the appropriate project.
 */
import { Database } from "bun:sqlite";
import {
  createProject,
  db,
  getAccountByDomain,
  getAllProjects,
  linkEmailToProject,
} from "./db";

// Connect to auto-permit database
const permitDbPath =
  "/Users/chiejimofor/Documents/Github/auto-permit/src/db/company-permits.sqlite";
const permitDb = new Database(permitDbPath, { readonly: true });

interface PermitRow {
  id: string;
  project_name: string | null;
  company_name: string | null;
  invoice_number: string | null;
}

interface PaymentEmail {
  id: number;
  body_preview: string;
}

/**
 * Extract invoice number from payment email body
 * Formats: "IV087518" or "Invoice Number: 87518"
 */
function extractInvoiceNumber(body: string): string | null {
  // Try "Account Number: IV087518" format
  const ivMatch = body.match(/Account Number: IV(\d+)/i);
  if (ivMatch) {
    return `IV${ivMatch[1]}`;
  }

  // Try "Invoice Number: 87518" format
  const numMatch = body.match(/Invoice Number: (\d+)/i);
  if (numMatch) {
    return `IV${numMatch[1]}`;
  }

  return null;
}

/**
 * Look up permit by invoice number
 */
function getPermitByInvoice(invoiceNumber: string): PermitRow | null {
  return permitDb
    .query<PermitRow, [string]>(
      "SELECT id, project_name, company_name, invoice_number FROM permits WHERE invoice_number = ?"
    )
    .get(invoiceNumber);
}

/**
 * Find or create a project for a permit
 */
function findOrCreateProjectForPermit(
  projectName: string,
  companyName: string | null
): number | null {
  // Normalize for matching
  const normalized = projectName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Check existing projects
  const projects = getAllProjects();
  for (const p of projects) {
    const pNorm = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      pNorm === normalized ||
      p.name.toLowerCase() === projectName.toLowerCase()
    ) {
      return p.id;
    }
  }

  // Try to find account by company name pattern
  let accountId: number | undefined;
  if (companyName) {
    // Common patterns: "FCL Builders LLC" -> "fclbuilders.com"
    const companyLower = companyName.toLowerCase();

    // Known mappings
    const domainMappings: Record<string, string> = {
      "fcl builders": "fclbuilders.com",
      "weis builders": "weisbuilders.com",
      "nrp contractors": "nrpgroup.com",
      "bpr companies": "bprcompanies.com",
      "edge construction": "edgeconstruction.com",
      clayco: "clayco.com",
      "chasse building": "chasse.us",
    };

    for (const [pattern, domain] of Object.entries(domainMappings)) {
      if (companyLower.includes(pattern)) {
        const account = getAccountByDomain(domain);
        if (account) {
          accountId = account.id;
          break;
        }
      }
    }
  }

  // Create new project
  const project = createProject(projectName, accountId);
  console.log(`  [NEW PROJECT] ${projectName} (id: ${project.id})`);
  return project.id;
}

/**
 * Link payment emails to projects via invoice numbers
 */
export function linkPaymentEmails(): void {
  console.log("Linking payment emails to projects via invoice numbers...\n");

  // Get all pointandpay payment emails
  const paymentEmails = db
    .query<PaymentEmail, []>(
      `SELECT id, body_preview FROM emails
       WHERE from_email LIKE '%pointandpay%'
       AND project_id IS NULL`
    )
    .all();

  console.log(`Found ${paymentEmails.length} unlinked payment emails\n`);

  let linked = 0;
  let noInvoice = 0;
  let noPermit = 0;
  let noProject = 0;

  for (const email of paymentEmails) {
    const invoiceNumber = extractInvoiceNumber(email.body_preview);

    if (!invoiceNumber) {
      noInvoice++;
      continue;
    }

    const permit = getPermitByInvoice(invoiceNumber);

    if (!permit) {
      noPermit++;
      console.log(`  [NO PERMIT] Invoice ${invoiceNumber} not found`);
      continue;
    }

    if (!permit.project_name) {
      noProject++;
      console.log(
        `  [NO PROJECT NAME] Permit ${permit.id} has no project name`
      );
      continue;
    }

    const projectId = findOrCreateProjectForPermit(
      permit.project_name,
      permit.company_name
    );

    if (projectId) {
      linkEmailToProject(email.id, projectId);
      linked++;
      console.log(
        `  [LINKED] ${invoiceNumber} → ${permit.project_name} (${permit.company_name})`
      );
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Linked: ${linked}`);
  console.log(`No invoice number: ${noInvoice}`);
  console.log(`Invoice not in permits DB: ${noPermit}`);
  console.log(`Permit has no project name: ${noProject}`);
}

// CLI
if (import.meta.main) {
  linkPaymentEmails();
}
