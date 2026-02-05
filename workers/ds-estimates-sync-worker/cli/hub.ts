#!/usr/bin/env bun

/**
 * Unified Hub CLI for Monday → hub.db sync
 *
 * Syncs Estimates, Contacts, and Contractors from Monday.com to local hub.db.
 * READ ONLY from Monday - only pulls data, never creates/updates/deletes.
 *
 * Usage:
 *   bun cli/hub.ts sync estimates [--limit=N] [--dry-run] [--skip-files]
 *   bun cli/hub.ts sync contacts [--limit=N] [--dry-run]
 *   bun cli/hub.ts sync contractors [--limit=N] [--dry-run]
 *   bun cli/hub.ts sync all [--limit=N] [--dry-run]
 *   bun cli/hub.ts stats
 *
 * Options:
 *   --limit=N     Max items to sync (default: all)
 *   --dry-run     Preview changes without writing to database
 *   --skip-files  Skip file downloads (estimates only)
 */

import { Database } from "bun:sqlite";
import { query, updateItem } from "../monday/client";
import { BOARD_IDS, CONTACTS_COLUMNS } from "../monday/types";
import { syncContacts } from "./sync/contacts";
import { syncContractors } from "./sync/contractors";
import { syncEstimates } from "./sync/estimates";
import { showStats } from "./sync/stats";

const HUB_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract/hub.db";

// Contact board groups
const CONTACT_GROUPS = {
  ACTIVE: "topics",
  OPEN_BIDS: "group_mksd6szc",
  BIDS_SENT: "group_mksdfj2a",
  SWPPP: "group_mkp9pntg",
  PERSONAL_EMAIL: "group_mm087tqw",
  INSUFFICIENT_INFO: "group_mm08qaqy",
  MISC: "group_mm0842jp", // Was "Marketing", renamed to "Misc" in Monday
  DUPLICATES: "group_mm08a93s",
} as const;

type ContactGroup = keyof typeof CONTACT_GROUPS;

const HELP = `
Hub CLI - Monday → hub.db sync

Commands:
  sync estimates     Sync ESTIMATING board → estimates table
  sync contacts      Sync CONTACTS board → contacts table
  sync contractors   Sync CONTRACTORS board → accounts table
  sync all           Sync all boards

  create account --name=<name> --domain=<domain> [--type=<type>]
                       Create account in BOTH hub.db AND Monday
  update contact <id> [options]   Update a contact
  update account <id> [options]   Update an account/contractor
  move contact <id> --group=<group>  Move contact to a group
  link contact <id> --account=<account_id>  Link contact to account
  stats              Show sync statistics

Create Account Options:
  --name=<name>        Account/company name (required)
  --domain=<domain>    Company domain e.g. nulawn.net (required)
  --type=<type>        Account type: contractor, developer, subcontractor, etc.

Update Contact Options:
  --name=<name>        Set contact name
  --email=<email>      Set email address
  --mobile=<phone>     Set mobile phone
  --office=<phone>     Set office phone
  --company=<phone>    Set company phone
  --fax=<phone>        Set company fax
  --title=<title>      Set job title
  --notes=<notes>      Set contractor_search_notes
  --push               Also update Monday (default: hub.db only)

Update Account Options:
  --name=<name>        Set account name
  --domain=<domain>    Set domain
  --type=<type>        Set account type
  --push               Also update Monday (default: hub.db only)

Move Groups:
  ACTIVE, OPEN_BIDS, BIDS_SENT, SWPPP, PERSONAL_EMAIL, INSUFFICIENT_INFO, MISC, DUPLICATES

Options:
  --limit=N          Max items to sync
  --dry-run          Preview without database writes
  --skip-files       Skip file downloads (estimates only)

Examples:
  bun cli/hub.ts sync contacts
  bun cli/hub.ts create account --name="NULAWN Landscape" --domain=nulawn.net --type=contractor
  bun cli/hub.ts update contact 3083 --email=x@y.com --title="Project Manager" --push
  bun cli/hub.ts link contact 2746 --account=4156
  bun cli/hub.ts move contact 4501 --group=ACTIVE
  bun cli/hub.ts stats
`;

// Map group IDs back to titles for local DB updates
const GROUP_TITLES: Record<string, string> = {
  topics: "Active Contacts",
  group_mksd6szc: "Open Bids Contacts",
  group_mksdfj2a: "Bids Sent Contacts",
  group_mkp9pntg: "Swpp Contact",
  group_mm087tqw: "Personal Email",
  group_mm08qaqy: "Insufficient Information",
  group_mm0842jp: "Marketing",
  group_mm08a93s: "Duplicates",
};

async function moveContactToGroup(
  contactId: string,
  groupName: ContactGroup
): Promise<void> {
  const db = new Database(HUB_DB_PATH);

  interface ContactRow {
    id: number;
    name: string;
    monday_item_id: string | null;
  }
  const contact = db
    .query<ContactRow, [string]>(
      "SELECT id, name, monday_item_id FROM contacts WHERE id = ?"
    )
    .get(contactId);

  if (!contact) {
    db.close();
    console.error(`Contact ${contactId} not found`);
    process.exit(1);
  }

  if (!contact.monday_item_id) {
    db.close();
    console.error(`Contact ${contactId} has no Monday item ID`);
    process.exit(1);
  }

  const groupId = CONTACT_GROUPS[groupName];
  const groupTitle = GROUP_TITLES[groupId] ?? groupName;
  console.log(`Moving "${contact.name}" to ${groupName}...`);

  await query(`
    mutation {
      move_item_to_group(item_id: ${contact.monday_item_id}, group_id: "${groupId}") {
        id
      }
    }
  `);

  // Update local DB
  db.run(
    "UPDATE contacts SET group_id = ?, group_title = ?, updated_at = datetime('now') WHERE id = ?",
    [groupId, groupTitle, contactId]
  );
  db.close();

  console.log(`✓ Moved to ${groupName}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  // Parse global options
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg
    ? Number.parseInt(limitArg.split("=")[1], 10)
    : undefined;
  const dryRun = args.includes("--dry-run");
  const skipFiles = args.includes("--skip-files");

  const command = args[0];
  const subcommand = args[1];

  if (command === "stats") {
    await showStats();
    return;
  }

  // Helper to parse args
  const getArg = (prefix: string): string | undefined => {
    const arg = args.find((a) => a.startsWith(`--${prefix}=`));
    return arg?.split("=").slice(1).join("=");
  };

  if (command === "create" && subcommand === "account") {
    const name = getArg("name");
    const domain = getArg("domain");
    const type = getArg("type") ?? "contractor";

    if (!(name && domain)) {
      console.error(
        "Usage: bun cli/hub.ts create account --name=<name> --domain=<domain> [--type=<type>]"
      );
      process.exit(1);
    }

    console.log(`Creating account: ${name}`);
    console.log(`  Domain: ${domain}`);
    console.log(`  Type: ${type}`);

    if (dryRun) {
      console.log("\n(dry run - no changes made)");
      return;
    }

    // Create in Monday first
    const domainUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    const createResult = await query(`
      mutation {
        create_item(
          board_id: ${BOARD_IDS.CONTRACTORS}
          item_name: "${name.replace(/"/g, '\\"')}"
          column_values: "{\\"company_domain\\": {\\"url\\": \\"${domainUrl}\\", \\"text\\": \\"${domain}\\"}}"
        ) {
          id
        }
      }
    `);

    const mondayId = createResult?.create_item?.id;
    if (!mondayId) {
      console.error("Failed to create in Monday");
      process.exit(1);
    }
    console.log(`✓ Created in Monday (ID: ${mondayId})`);

    // Create in hub.db
    const db = new Database(HUB_DB_PATH);
    const result = db.run(
      `INSERT INTO accounts (name, domain, type, monday_account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [name, domain, type, mondayId]
    );
    const localId = result.lastInsertRowid;
    db.close();

    console.log(`✓ Created in hub.db (ID: ${localId})`);
    console.log(
      `\nAccount created: ${name} (local: ${localId}, monday: ${mondayId})`
    );
    return;
  }

  if (command === "link" && subcommand === "contact") {
    const contactId = args[2];
    const accountIdArg = getArg("account");

    if (!(contactId && accountIdArg)) {
      console.error(
        "Usage: bun cli/hub.ts link contact <contact_id> --account=<account_id>"
      );
      process.exit(1);
    }

    const db = new Database(HUB_DB_PATH);

    // Get contact
    interface ContactRow {
      id: number;
      name: string;
      account_id: number | null;
    }
    const contact = db
      .query<ContactRow, [string]>(
        "SELECT id, name, account_id FROM contacts WHERE id = ?"
      )
      .get(contactId);

    if (!contact) {
      console.error(`Contact ${contactId} not found`);
      db.close();
      process.exit(1);
    }

    // Get account
    interface AccountRow {
      id: number;
      name: string;
    }
    const account = db
      .query<AccountRow, [string]>("SELECT id, name FROM accounts WHERE id = ?")
      .get(accountIdArg);

    if (!account) {
      console.error(`Account ${accountIdArg} not found`);
      db.close();
      process.exit(1);
    }

    console.log(
      `Linking contact "${contact.name}" to account "${account.name}"`
    );

    if (dryRun) {
      console.log("\n(dry run - no changes made)");
      db.close();
      return;
    }

    db.run(
      "UPDATE contacts SET account_id = ?, updated_at = datetime('now') WHERE id = ?",
      [accountIdArg, contactId]
    );
    db.close();

    console.log(`✓ Linked contact ${contactId} to account ${accountIdArg}`);
    return;
  }

  if (command === "move" && subcommand === "contact") {
    const contactId = args[2];
    const groupArg = args.find((a) => a.startsWith("--group="));
    const groupName = groupArg?.split("=")[1]?.toUpperCase() as ContactGroup;

    if (!(contactId && groupName)) {
      console.error("Usage: bun cli/hub.ts move contact <id> --group=<GROUP>");
      console.error(
        "Groups: ACTIVE, OPEN_BIDS, BIDS_SENT, SWPPP, PERSONAL_EMAIL, INSUFFICIENT_INFO, MISC, DUPLICATES"
      );
      process.exit(1);
    }

    if (!(groupName in CONTACT_GROUPS)) {
      console.error(`Unknown group: ${groupName}`);
      console.error(
        "Valid groups: ACTIVE, OPEN_BIDS, BIDS_SENT, SWPPP, PERSONAL_EMAIL, INSUFFICIENT_INFO, MISC, DUPLICATES"
      );
      process.exit(1);
    }

    await moveContactToGroup(contactId, groupName);
    return;
  }

  if (command === "update" && subcommand === "contact") {
    const contactId = args[2];
    const pushToMonday = args.includes("--push");

    // Parse field options
    const getArg = (prefix: string): string | undefined => {
      const arg = args.find((a) => a.startsWith(`--${prefix}=`));
      return arg?.split("=").slice(1).join("="); // Handle values with = in them
    };

    const name = getArg("name");
    const email = getArg("email");
    const mobile = getArg("mobile");
    const office = getArg("office");
    const company = getArg("company");
    const fax = getArg("fax");
    const title = getArg("title");
    const notes = getArg("notes");

    if (!contactId) {
      console.error(
        "Usage: bun cli/hub.ts update contact <id> [--name=...] [--email=...] [--mobile=...] [--office=...] [--company=...] [--fax=...] [--title=...] [--notes=...] [--push]"
      );
      process.exit(1);
    }

    if (
      !(name || email || mobile || office || company || fax || title || notes)
    ) {
      console.error(
        "Must provide at least one field to update: --name, --email, --mobile, --office, --company, --fax, --title, or --notes"
      );
      process.exit(1);
    }

    const db = new Database(HUB_DB_PATH);

    // Get current contact info
    interface ContactRow {
      id: number;
      name: string;
      email: string | null;
      mobile_phone: string | null;
      office_phone: string | null;
      company_phone: string | null;
      company_fax: string | null;
      title: string | null;
      monday_item_id: string | null;
      contractor_search_notes: string | null;
    }
    const contact = db
      .query<ContactRow, [string]>(
        "SELECT id, name, email, mobile_phone, office_phone, company_phone, company_fax, title, monday_item_id, contractor_search_notes FROM contacts WHERE id = ?"
      )
      .get(contactId);

    if (!contact) {
      console.error(`Contact ${contactId} not found`);
      process.exit(1);
    }

    console.log(`Updating contact ${contact.id}: ${contact.name}`);
    if (name) {
      console.log(`  Name: ${contact.name} → ${name}`);
    }
    if (email) {
      console.log(`  Email: ${contact.email ?? "(none)"} → ${email}`);
    }
    if (mobile) {
      console.log(`  Mobile: ${contact.mobile_phone ?? "(none)"} → ${mobile}`);
    }
    if (office) {
      console.log(`  Office: ${contact.office_phone ?? "(none)"} → ${office}`);
    }
    if (company) {
      console.log(
        `  Company: ${contact.company_phone ?? "(none)"} → ${company}`
      );
    }
    if (fax) {
      console.log(`  Fax: ${contact.company_fax ?? "(none)"} → ${fax}`);
    }
    if (title) {
      console.log(`  Title: ${contact.title ?? "(none)"} → ${title}`);
    }
    if (notes) {
      console.log(
        `  Notes: ${contact.contractor_search_notes ?? "(none)"} → ${notes}`
      );
    }
    console.log(`  Push to Monday: ${pushToMonday ? "YES" : "no"}`);

    if (dryRun) {
      console.log("\n(dry run - no changes made)");
      db.close();
      return;
    }

    // Update hub.db
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (name) {
      updates.push("name = ?");
      values.push(name);
    }
    if (email) {
      updates.push("email = ?");
      values.push(email);
    }
    if (mobile) {
      updates.push("mobile_phone = ?");
      values.push(mobile);
    }
    if (office) {
      updates.push("office_phone = ?");
      values.push(office);
    }
    if (company) {
      updates.push("company_phone = ?");
      values.push(company);
    }
    if (fax) {
      updates.push("company_fax = ?");
      values.push(fax);
    }
    // Also set default phone field (priority: mobile > office > company)
    const defaultPhone = mobile ?? office ?? company;
    if (defaultPhone) {
      updates.push("phone = ?");
      values.push(defaultPhone);
    }
    if (title) {
      updates.push("title = ?");
      values.push(title);
    }
    if (notes) {
      updates.push("contractor_search_notes = ?");
      values.push(notes);
      updates.push("contractor_searched_at = datetime('now')");
    }
    updates.push("updated_at = datetime('now')");
    values.push(contactId);

    db.run(`UPDATE contacts SET ${updates.join(", ")} WHERE id = ?`, values);
    console.log("\n✓ Updated hub.db");

    // Update Monday if requested
    if (pushToMonday) {
      if (!contact.monday_item_id) {
        console.error("Cannot push to Monday: contact has no monday_item_id");
        db.close();
        process.exit(1);
      }

      const mondayValues: Record<string, unknown> = {};

      // Helper to format phone for Monday API
      const formatPhone = (p: string): string => {
        let formatted = p.replace(/\D/g, "");
        if (formatted.length === 10) {
          formatted = `+1${formatted}`;
        } else if (!formatted.startsWith("+")) {
          formatted = `+${formatted}`;
        }
        return formatted;
      };

      if (email) {
        mondayValues[CONTACTS_COLUMNS.EMAIL.id] = { email, text: email };
      }
      if (mobile) {
        mondayValues[CONTACTS_COLUMNS.MOBILE_PHONE.id] = {
          phone: formatPhone(mobile),
          countryShortName: "US",
        };
      }
      if (office) {
        mondayValues[CONTACTS_COLUMNS.OFFICE_PHONE.id] = {
          phone: formatPhone(office),
          countryShortName: "US",
        };
      }
      if (company) {
        mondayValues[CONTACTS_COLUMNS.COMPANY_PHONE.id] = {
          phone: formatPhone(company),
          countryShortName: "US",
        };
      }
      if (fax) {
        mondayValues[CONTACTS_COLUMNS.COMPANY_FAX.id] = {
          phone: formatPhone(fax),
          countryShortName: "US",
        };
      }
      // Also set default Phone field (priority: mobile > office > company)
      if (defaultPhone) {
        mondayValues[CONTACTS_COLUMNS.PHONE.id] = {
          phone: formatPhone(defaultPhone),
          countryShortName: "US",
        };
      }
      if (title) {
        // Dropdown columns use labels array format (skip Title - Label status due to 40 label limit)
        mondayValues[CONTACTS_COLUMNS.TITLE.id] = { labels: [title] };
      }

      // Update column values if any
      if (Object.keys(mondayValues).length > 0) {
        await updateItem({
          boardId: BOARD_IDS.CONTACTS,
          itemId: contact.monday_item_id,
          columnValues: mondayValues,
          createLabelsIfMissing: true,
        });
      }

      // Update name separately (item name, not a column)
      if (name) {
        const escapedName = name.replace(/"/g, '\\"');
        await query(`
          mutation {
            change_simple_column_value(
              board_id: ${BOARD_IDS.CONTACTS}
              item_id: ${contact.monday_item_id}
              column_id: "name"
              value: "${escapedName}"
            ) {
              id
            }
          }
        `);
      }
      console.log("✓ Updated Monday");
    }

    db.close();
    return;
  }

  if (command === "update" && subcommand === "account") {
    const accountId = args[2];
    const pushToMonday = args.includes("--push");

    // Parse field options
    const getArg = (prefix: string): string | undefined => {
      const arg = args.find((a) => a.startsWith(`--${prefix}=`));
      return arg?.split("=").slice(1).join("=");
    };

    const newName = getArg("name");

    if (!accountId) {
      console.error(
        "Usage: bun cli/hub.ts update account <id> --name=<name> [--push]"
      );
      process.exit(1);
    }

    if (!newName) {
      console.error("Must provide --name=<name> to update");
      process.exit(1);
    }

    const db = new Database(HUB_DB_PATH);

    interface AccountRow {
      id: number;
      name: string;
      monday_account_id: string | null;
    }
    const account = db
      .query<AccountRow, [string]>(
        "SELECT id, name, monday_account_id FROM accounts WHERE id = ?"
      )
      .get(accountId);

    if (!account) {
      console.error(`Account ${accountId} not found`);
      process.exit(1);
    }

    console.log(`Updating account ${account.id}:`);
    console.log(`  Name: "${account.name}" → "${newName}"`);
    console.log(`  Push to Monday: ${pushToMonday ? "YES" : "no"}`);

    if (dryRun) {
      console.log("\n(dry run - no changes made)");
      db.close();
      return;
    }

    // Update hub.db
    db.run(
      "UPDATE accounts SET name = ?, updated_at = datetime('now') WHERE id = ?",
      [newName, accountId]
    );
    console.log("\n✓ Updated hub.db");

    // Update Monday if requested
    if (pushToMonday) {
      if (!account.monday_account_id) {
        console.error(
          "Cannot push to Monday: account has no monday_account_id"
        );
        db.close();
        process.exit(1);
      }

      // Rename item in Monday using change_simple_column_value
      const escapedName = newName.replace(/"/g, '\\"');
      await query(`
        mutation {
          change_simple_column_value(
            board_id: ${BOARD_IDS.CONTRACTORS}
            item_id: ${account.monday_account_id}
            column_id: "name"
            value: "${escapedName}"
          ) {
            id
          }
        }
      `);
      console.log("✓ Updated Monday");
    }

    db.close();
    return;
  }

  if (command === "sync") {
    const options = { limit, dryRun, skipFiles };

    switch (subcommand) {
      case "estimates":
        await syncEstimates(options);
        break;

      case "contacts":
        await syncContacts(options);
        break;

      case "contractors":
        await syncContractors(options);
        break;

      case "all":
        console.log("=".repeat(60));
        console.log("SYNC ALL - Contractors → Contacts → Estimates");
        console.log("=".repeat(60));
        console.log();

        // Sync in dependency order: contractors first, then contacts, then estimates
        console.log("STEP 1: Syncing contractors...\n");
        await syncContractors(options);

        console.log("\nSTEP 2: Syncing contacts...\n");
        await syncContacts(options);

        console.log("\nSTEP 3: Syncing estimates...\n");
        await syncEstimates(options);

        console.log(`\n${"=".repeat(60)}`);
        console.log("ALL SYNCS COMPLETE");
        console.log("=".repeat(60));
        break;

      default:
        console.error(`Unknown subcommand: ${subcommand}`);
        console.log(HELP);
        process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.log(HELP);
  process.exit(1);
}

main().catch((error) => {
  console.error("CLI error:", error);
  process.exit(1);
});
