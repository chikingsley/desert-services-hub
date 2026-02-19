#!/usr/bin/env bun
/**
 * Desert Email CLI
 *
 * Command-line interface for email and M365 group operations.
 * All sent emails include your signature automatically (use --no-signature to skip).
 *
 * Usage:
 *   bun packages/email/cli/cli.ts <command> [options]
 *
 * Run with --help for full command list.
 */
import { DEFAULT_USER } from "@email/commands/config";
import { draftHandlers } from "@email/commands/draft/handlers";
import { foldersHandlers } from "@email/commands/folders";
import { groupHandlers } from "@email/commands/groups";
import { mailboxHandlers } from "@email/commands/mailboxes";
import { organizeHandlers } from "@email/commands/organize/handlers";
import { readHandlers } from "@email/commands/read";
import { searchHandlers } from "@email/commands/search";
import { sendHandlers } from "@email/commands/send";
import { signOrderHandlers } from "@email/commands/sign-orders";
import { syncHandlers } from "@email/commands/sync";
import { templateHandlers } from "@email/commands/templates";
import type { CommandHandler } from "@email/commands/types";

// ============================================================================
// Merge all command handlers
// ============================================================================

const handlers: Record<string, CommandHandler> = {
  ...searchHandlers,
  ...sendHandlers,
  ...signOrderHandlers,
  ...readHandlers,
  ...draftHandlers,
  ...foldersHandlers,
  ...organizeHandlers,
  ...templateHandlers,
  ...groupHandlers,
  ...mailboxHandlers,
  ...syncHandlers,
};

// ============================================================================
// Help
// ============================================================================

function showHelp() {
  console.log(`
Desert Email CLI

Usage: bun packages/email/cli/cli.ts <command> [options]

Email Commands:
  search <query>              Search emails in your mailbox (supports --folder)
  search-all <query>          Search across all org mailboxes
  move <messageId>            Move a message to a folder (requires --dest, use --apply)
  move-thread <messageId>     Move all messages in a thread (requires --dest folderId, use --apply)
  project-hydrate <project>   Move all emails linked to a project into its Outlook folder (use --apply)
  project-hydrate-tracked     Hydrate all tracked project folders (batch mode, use --apply)
  project-folders             List tracked Outlook project folders (from Supabase Postgres)
  project-folder-create <project>  Create a missing Outlook folder for a project (use --apply)
  project-folder-mkdir <name> Create a new Outlook Projects/Active folder by name (use --apply)
  send                        Send an email (supports attachments)
  send-template <name>        Send email using HTML template
  reply <messageId>           Reply to an email (sends immediately)
  get <messageId>             Get full email content
  thread <messageId>          Get email thread
  download-attachments <id>   Download attachments from an email
  folders                     List mail folders (supports --recursive)

Sync Commands:
  sync-mailboxes [options]    Sync email from all/specific mailboxes
  sync-mailboxes status       Show sync status for all mailboxes + groups
  sync-groups [options]       Sync M365 group conversations
  body-link-backfill [opts]   Backfill/download body links for stored emails
  body-link-auth-bootstrap    Bootstrap persistent BuildingConnected auth state

Admin Commands:
  mailboxes                   List all tenant mailboxes from Graph API

Draft Commands:
  draft                       Create a new email draft
  reply-draft <query>         Find email by search and create reply draft
  reply-draft-by-id <id>     Create reply draft to specific email by ID
  send-draft <draftId>        Send an existing draft

Template Commands:
  templates                   List available email templates
  template <name>             Send test email from template (to self)
  send-template <name>        Send template to recipients

Sign Order Commands:
  sign-order-draft            Create Sandstorm sign-order draft + tracker record
  sign-orders                 List tracked sign orders
  sign-order-update <id>      Update tracked sign-order status

Mailbox Shortcuts (emails):
  contracts [query]           Search contracts@desertservices.net mailbox
  estimating [query]          Search estimating@desertservices.net mailbox

M365 Group Commands (conversations):
  groups                      List all M365 groups
  ic [query]                  InternalContracts group (list or search)
  ic-download                 Download all IC PDFs (--out, --since, --limit)
  group-conversations <name>  List conversations in a group
  group-conversation <name> <cid>  Get full conversation
  group-download <name>       Download PDFs from a group (--out, --since, --limit)
  search-group <name> <query> Search group conversations

Known Groups: ic, internal-contracts, dust-control, all-company, accounting, sales
Known Mailboxes: contracts, estimating, chi, tim

Options:
  --user, -u <email>          Mailbox to search (default: ${DEFAULT_USER})
                              Required for all write commands (draft/reply/move/send).
  --dest, -d <folderId>       Destination folder ID (for move/move-thread)
  --apply                     Actually perform write operations (default: dry-run)
  --quiet                     Reduce output (useful for batch hydration)
  --concurrency <n>           Parallelism for move operations (default varies by command)
  --max-projects <n>          Limit batch hydration to N projects (project-hydrate-tracked)
  --to <emails>               Recipients (comma-separated)
  --cc <emails>               CC recipients (comma-separated)
  --subject, -s <text>        Email subject
  --body, -b <text>           Email body
  --vars, -v <json>           Template variables as JSON
  --attachments, -a <paths>   File attachments (comma-separated paths)
  --limit, -l <number>        Max results (default: 10)
  --reply-all                 Reply to all recipients
  --no-signature              Skip auto-signature
  EMAIL_CLI_ENABLE_SEND=1     Required to enable send/reply/send-draft/send-template

Examples:
  bun packages/email/cli/cli.ts contracts                    # List contracts mailbox emails
  bun packages/email/cli/cli.ts contracts "Layton"           # Search contracts mailbox
  bun packages/email/cli/cli.ts estimating "bid"             # Search estimating mailbox
  bun packages/email/cli/cli.ts ic                           # List InternalContracts group
  bun packages/email/cli/cli.ts ic "Helen"                   # Search InternalContracts group
  bun packages/email/cli/cli.ts search-group dust-control "permit"

  # Create drafts:
  bun packages/email/cli/cli.ts draft --subject "Hello" --body "Hi there" --to "user@example.com"
  bun packages/email/cli/cli.ts reply-draft "invoice" --body "Thanks for the invoice" --reply-all
  bun packages/email/cli/cli.ts send-draft <draftId>         # Send an existing draft

  # Send dust permit email using template:
  bun packages/email/cli/cli.ts send-template dust-permit-issued \\
    --to "contact@gc.com" --subject "Dust Permit Issued - Project X" \\
    --vars '{"recipientName":"John","projectName":"Project X",...}' \\
    --attachments "/path/to/permit.pdf"

  # Create a tracked Sandstorm draft (one sign type at a time):
  bun packages/email/cli/cli.ts sign-order-draft \\
    --user chi@desertservices.net \\
    --project "Lexington 420" \\
    --sign-type dust-maricopa \\
    --permit-id D0064501 \\
    --contact-name "Scott Turner" \\
    --contact-phone "623-202-5233"
`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  const handler = handlers[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error("Run with --help for usage information.");
    process.exit(1);
  }

  try {
    await handler(args.slice(1));
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
