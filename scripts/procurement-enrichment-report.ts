#!/usr/bin/env bun

/**
 * Generate enrichment report from procurement data
 *
 * Compares hub.db contacts with procurement.db and outputs a CSV
 * of all contacts that can be enriched (missing email, phone, etc.)
 *
 * Usage:
 *   bun scripts/procurement-enrichment-report.ts
 *
 * Output: scripts/enrichment-opportunities.csv
 *
 * Then use hub CLI to apply:
 *   bun cli/hub.ts update contact <id> --email=x --phone=y --push
 */

import { Database } from "bun:sqlite";

const HUB_DB =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract-ui/contract/hub.db";
const PROC_DB = "./scripts/procurement.db";
const OUTPUT_CSV = "./scripts/enrichment-opportunities.csv";

interface HubContact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  account_id: number | null;
  monday_item_id: string | null;
  group_title: string | null;
}

interface ProcContact {
  contact_name: string;
  email: string;
  phone: string | null;
  contractor_name: string;
}

interface EnrichmentRow {
  hub_id: number;
  monday_id: string;
  name: string;
  group_title: string;
  current_email: string;
  new_email: string;
  email_source: string;
  current_phone: string;
  new_phone: string;
  phone_source: string;
  contractor_hint: string;
  match_type: string;
}

function normalizePhone(phone: string | null): string {
  if (!phone) return "";
  // Strip to just digits
  const digits = phone.replace(/\D/g, "");
  // Take last 10 digits (ignore country code)
  return digits.slice(-10);
}

function normalizeName(name: string): string {
  return name.toUpperCase().trim().replace(/\s+/g, " ");
}

async function main(): Promise<void> {
  console.log("Loading databases...\n");

  const hubDb = new Database(HUB_DB, { readonly: true });
  const procDb = new Database(PROC_DB, { readonly: true });

  // Load all hub contacts
  const hubContacts = hubDb
    .query<HubContact, []>(`
    SELECT id, name, email, phone, mobile_phone, account_id, monday_item_id, group_title
    FROM contacts
    WHERE group_title NOT IN ('Insufficient Information', 'Duplicates')
  `)
    .all();

  console.log(`Loaded ${hubContacts.length} hub contacts`);

  // Load all procurement contacts (deduplicated)
  const procContacts = procDb
    .query<ProcContact, []>(`
    SELECT DISTINCT
      UPPER(TRIM(contact_name)) as contact_name,
      LOWER(TRIM(email)) as email,
      phone,
      contractor_name
    FROM bids_sent
    WHERE contact_name IS NOT NULL AND contact_name != ''
      AND email IS NOT NULL AND email != ''
    UNION
    SELECT DISTINCT
      UPPER(TRIM(contact_name)),
      LOWER(TRIM(email)),
      phone,
      contractor_name
    FROM open_bids
    WHERE contact_name IS NOT NULL AND contact_name != ''
      AND email IS NOT NULL AND email != ''
  `)
    .all();

  console.log(`Loaded ${procContacts.length} procurement contacts\n`);

  // Build lookup maps
  const procByName = new Map<string, ProcContact[]>();
  const procByEmail = new Map<string, ProcContact[]>();

  for (const pc of procContacts) {
    const name = normalizeName(pc.contact_name);
    if (!procByName.has(name)) procByName.set(name, []);
    procByName.get(name)!.push(pc);

    const email = pc.email.toLowerCase();
    if (!procByEmail.has(email)) procByEmail.set(email, []);
    procByEmail.get(email)!.push(pc);
  }

  console.log(
    `Built lookup: ${procByName.size} unique names, ${procByEmail.size} unique emails\n`
  );

  // Find enrichment opportunities
  const enrichments: EnrichmentRow[] = [];

  for (const hub of hubContacts) {
    const hubName = normalizeName(hub.name);
    const hubEmail = hub.email?.toLowerCase().trim() || "";
    const hubPhone = normalizePhone(hub.phone || hub.mobile_phone);

    let newEmail = "";
    let emailSource = "";
    let newPhone = "";
    let phoneSource = "";
    let contractorHint = "";
    let matchType = "";

    // Case 1: Hub has email, missing phone - match by email
    if (hubEmail && !hubPhone) {
      const matches = procByEmail.get(hubEmail);
      if (matches) {
        for (const m of matches) {
          const procPhone = normalizePhone(m.phone);
          if (procPhone && procPhone.length === 10) {
            newPhone = m.phone || "";
            phoneSource = "email_match";
            contractorHint = m.contractor_name;
            matchType = "FILL_PHONE";
            break;
          }
        }
      }
    }

    // Case 2: Hub missing email - match by name
    if (!hubEmail) {
      const matches = procByName.get(hubName);
      if (matches && matches.length > 0) {
        // Prefer matches with phone if hub also missing phone
        const sorted = [...matches].sort((a, b) => {
          const aHasPhone = normalizePhone(a.phone).length === 10 ? 1 : 0;
          const bHasPhone = normalizePhone(b.phone).length === 10 ? 1 : 0;
          return bHasPhone - aHasPhone;
        });

        const best = sorted[0];
        newEmail = best.email;
        emailSource = "name_match";
        contractorHint = best.contractor_name;
        matchType = "FILL_EMAIL";

        // Also grab phone if missing
        if (!hubPhone) {
          const procPhone = normalizePhone(best.phone);
          if (procPhone && procPhone.length === 10) {
            newPhone = best.phone || "";
            phoneSource = "name_match";
            matchType = "FILL_BOTH";
          }
        }
      }
    }

    // Only add if we have something to enrich
    if (newEmail || newPhone) {
      enrichments.push({
        hub_id: hub.id,
        monday_id: hub.monday_item_id || "",
        name: hub.name,
        group_title: hub.group_title || "",
        current_email: hub.email || "",
        new_email: newEmail,
        email_source: emailSource,
        current_phone: hub.phone || hub.mobile_phone || "",
        new_phone: newPhone,
        phone_source: phoneSource,
        contractor_hint: contractorHint,
        match_type: matchType,
      });
    }
  }

  // Sort by match type, then name
  enrichments.sort((a, b) => {
    if (a.match_type !== b.match_type) {
      const order = ["FILL_BOTH", "FILL_EMAIL", "FILL_PHONE"];
      return order.indexOf(a.match_type) - order.indexOf(b.match_type);
    }
    return a.name.localeCompare(b.name);
  });

  // Stats
  const fillBoth = enrichments.filter(
    (e) => e.match_type === "FILL_BOTH"
  ).length;
  const fillEmail = enrichments.filter(
    (e) => e.match_type === "FILL_EMAIL"
  ).length;
  const fillPhone = enrichments.filter(
    (e) => e.match_type === "FILL_PHONE"
  ).length;

  console.log("=".repeat(60));
  console.log("ENRICHMENT OPPORTUNITIES");
  console.log("=".repeat(60));
  console.log(`  FILL_BOTH (email + phone):  ${fillBoth}`);
  console.log(`  FILL_EMAIL (email only):    ${fillEmail}`);
  console.log(`  FILL_PHONE (phone only):    ${fillPhone}`);
  console.log("  ────────────────────────────");
  console.log(`  TOTAL:                      ${enrichments.length}`);
  console.log();

  // Write CSV
  const csvHeader = [
    "hub_id",
    "monday_id",
    "name",
    "group_title",
    "current_email",
    "new_email",
    "email_source",
    "current_phone",
    "new_phone",
    "phone_source",
    "contractor_hint",
    "match_type",
    "apply_cli_command",
  ].join(",");

  const csvRows = enrichments.map((e) => {
    // Build the CLI command
    const args: string[] = [];
    if (e.new_email) args.push(`--email="${e.new_email}"`);
    if (e.new_phone) {
      const normalized = normalizePhone(e.new_phone);
      if (normalized.length === 10) {
        args.push(`--mobile=${normalized}`);
      }
    }
    const cliCmd =
      args.length > 0
        ? `bun cli/hub.ts update contact ${e.hub_id} ${args.join(" ")} --push`
        : "";

    return [
      e.hub_id,
      e.monday_id,
      `"${e.name.replace(/"/g, '""')}"`,
      `"${e.group_title}"`,
      e.current_email,
      e.new_email,
      e.email_source,
      e.current_phone,
      e.new_phone,
      e.phone_source,
      `"${e.contractor_hint.replace(/"/g, '""')}"`,
      e.match_type,
      `"${cliCmd}"`,
    ].join(",");
  });

  const csv = [csvHeader, ...csvRows].join("\n");
  await Bun.write(OUTPUT_CSV, csv);

  console.log(`CSV written to: ${OUTPUT_CSV}`);
  console.log();
  console.log("Sample commands to apply:");
  console.log();

  // Show first 5 commands
  for (const e of enrichments.slice(0, 5)) {
    const args: string[] = [];
    if (e.new_email) args.push(`--email="${e.new_email}"`);
    if (e.new_phone) {
      const normalized = normalizePhone(e.new_phone);
      if (normalized.length === 10) {
        args.push(`--mobile=${normalized}`);
      }
    }
    if (args.length > 0) {
      console.log(
        `  bun cli/hub.ts update contact ${e.hub_id} ${args.join(" ")} --push`
      );
    }
  }

  console.log("  ...");
  console.log();

  hubDb.close();
  procDb.close();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
