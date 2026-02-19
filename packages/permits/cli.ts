#!/usr/bin/env bun
/**
 * Permit Worker CLI
 *
 * Host-side CLI wrapping PermitClient for permit operations.
 * Auto-defaults to http://localhost:47822 (host port binding).
 *
 * Usage: bun run permit <command> [args] [flags]
 */

import { PermitClient, PermitWorkerError } from "./src/client";

// ---------------------------------------------------------------------------
// Config — CLI runs on the host, so default to localhost
// ---------------------------------------------------------------------------

const HOST_DEFAULT_URL = "http://localhost:47822";
const MUTATION_TIMEOUT_MS = 300_000; // 5 min — browser automation is slow
const READ_TIMEOUT_MS = 30_000;

const baseUrl = process.env.PERMIT_WORKER_URL || HOST_DEFAULT_URL;

const client = new PermitClient({ baseUrl, timeoutMs: READ_TIMEOUT_MS });
const mutationClient = new PermitClient({
  baseUrl,
  timeoutMs: MUTATION_TIMEOUT_MS,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage(): never {
  console.log(`
Permit Worker CLI

Usage: bun run permit <command> [args] [flags]

Commands:
  health                                    Check permit worker health
  list                                      List all permits
  get <id>                                  Get permit details
  close <id> [--reason <r>]                 Close a permit
  renew <id> --company <name>               Renew a permit (no payment)
  renew-and-pay <id> --company <name>       Renew + submit + pay (requires confirmation)
  revise <id> --type <t> [--notes <n>]      Revise a permit
  scrape-pdf <id>                           Scrape permit + generate PDF
  scrape <id>                               Scrape permit data only
  delete <id>                               Delete a draft permit
  delete-drafts                             Delete all draft permits
  sync                                      Full sync (company + marketing)
  sync-company                              Company-only sync
  browser-status                            Browser session status

Flags:
  --reason <reason>       Close reason (default: "completed")
  --company <name>        Company name (required for renew / renew-and-pay)
  --type <type>           Revision type: boundary|acreage|contact|schedule|bmp|other
  --notes <notes>         Revision notes (optional)
  --expedited             Enable accelerated processing (renew-and-pay only, default: OFF)
  --dry-run               Stop at payment review page without paying (renew-and-pay only)
  --yes                   Skip confirmation prompt (renew-and-pay only)

Environment:
  PERMIT_WORKER_URL       Override base URL (default: ${HOST_DEFAULT_URL})

Examples:
  bun run permit health
  bun run permit close D0063827 --reason completed
  bun run permit renew D0063827 --company "Weis Builders Inc"
  bun run permit renew-and-pay D0054348 --company "STRUCTR Group" --dry-run
  bun run permit renew-and-pay D0054348 --company "STRUCTR Group" --expedited --yes
  bun run permit revise D0064070 --type contact --notes "Update phone"
  bun run permit scrape-pdf D0061391
`.trim());
  process.exit(1);
}

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function print(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];
const positional = args[1]; // first positional after command

if (!command) usage();

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

try {
  switch (command) {
    case "health": {
      print(await client.health());
      break;
    }

    case "list": {
      print(await client.listPermits());
      break;
    }

    case "get": {
      if (!positional) die("Missing permit ID. Usage: bun run permit get <id>");
      print(await client.getPermit(positional));
      break;
    }

    case "close": {
      if (!positional)
        die("Missing permit ID. Usage: bun run permit close <id>");
      const reason = flag("reason") || "completed";
      console.log(`Closing ${positional} (reason: ${reason})...`);
      print(await mutationClient.closePermit(positional, { reason }));
      break;
    }

    case "renew": {
      if (!positional)
        die("Missing permit ID. Usage: bun run permit renew <id> --company <name>");
      const companyName = flag("company");
      if (!companyName) die("--company is required for renew");
      console.log(`Renewing ${positional} for ${companyName}...`);
      print(await mutationClient.renewPermit(positional, { companyName }));
      break;
    }

    case "renew-and-pay": {
      if (!positional)
        die(
          "Missing permit ID. Usage: bun run permit renew-and-pay <id> --company <name>"
        );
      const rapCompany = flag("company");
      if (!rapCompany) die("--company is required for renew-and-pay");
      const rapExpedited = args.includes("--expedited");
      const rapDryRun = args.includes("--dry-run");
      const rapYes = args.includes("--yes");

      // Confirmation gate — renew-and-pay spends real money
      console.log("\n=== RENEW AND PAY ===");
      console.log(`  Permit:    ${positional}`);
      console.log(`  Company:   ${rapCompany}`);
      console.log(`  Expedited: ${rapExpedited ? "YES" : "NO"}`);
      console.log(`  Dry Run:   ${rapDryRun ? "YES (no payment)" : "NO (will pay)"}`);
      console.log("");

      if (!rapYes && !rapDryRun) {
        process.stdout.write("Proceed? This will charge the card on file. [y/N] ");
        const buf = Buffer.alloc(16);
        const bytesRead = require("fs").readSync(0, buf, 0, 16);
        const answer = buf.toString("utf8", 0, bytesRead).trim().toLowerCase();
        if (answer !== "y" && answer !== "yes") {
          console.log("Aborted.");
          process.exit(0);
        }
      }

      console.log("Starting renew-and-pay...");
      print(
        await mutationClient.renewAndPay(positional, {
          companyName: rapCompany,
          expedited: rapExpedited,
        })
      );
      break;
    }

    case "revise": {
      if (!positional)
        die("Missing permit ID. Usage: bun run permit revise <id> --type <t>");
      const revisionType = flag("type");
      if (!revisionType) die("--type is required for revise");
      const notes = flag("notes");
      console.log(`Revising ${positional} (type: ${revisionType})...`);
      print(
        await mutationClient.revisePermit(positional, { revisionType, notes })
      );
      break;
    }

    case "scrape-pdf": {
      if (!positional)
        die("Missing permit ID. Usage: bun run permit scrape-pdf <id>");
      console.log(`Scraping + PDF for ${positional}...`);
      const result = await mutationClient.scrapePdf({
        permitId: positional,
      });
      // Don't dump base64 to terminal
      const { pdfBase64: _, ...rest } = result;
      print(rest);
      if (result.pdfPath) console.log(`PDF saved: ${result.pdfPath}`);
      break;
    }

    case "scrape": {
      if (!positional)
        die("Missing permit ID. Usage: bun run permit scrape <id>");
      console.log(`Scraping ${positional}...`);
      print(await mutationClient.scrape(positional));
      break;
    }

    case "delete": {
      if (!positional)
        die("Missing permit ID. Usage: bun run permit delete <id>");
      console.log(`Deleting draft ${positional}...`);
      print(await mutationClient.deletePermit(positional));
      break;
    }

    case "delete-drafts": {
      console.log("Deleting all drafts...");
      print(await mutationClient.deleteAllDrafts());
      break;
    }

    case "sync": {
      console.log("Running full sync...");
      print(await mutationClient.sync());
      break;
    }

    case "sync-company": {
      console.log("Running company sync...");
      print(await mutationClient.syncCompany({ timeoutMs: MUTATION_TIMEOUT_MS }));
      break;
    }

    case "browser-status": {
      print(await client.browserStatus());
      break;
    }

    default:
      die(`Unknown command: ${command}`);
  }
} catch (error) {
  if (error instanceof PermitWorkerError) {
    console.error(`\nPermitWorkerError [${error.endpoint}]`);
    console.error(`  Status: ${error.status}`);
    console.error(`  Message: ${error.message}`);
    if (error.body) console.error(`  Body: ${JSON.stringify(error.body)}`);
    process.exit(1);
  }
  throw error;
}
