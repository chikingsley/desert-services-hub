/**
 * Backfill Direct Relations on Estimating Board
 *
 * Populates:
 * - "Contacts - Direct" from existing "Contacts" column
 * - "Contractors - Direct" by looking up Contact → Contractor relationship
 *
 * Usage:
 *   bun backfill-direct-relations.ts --dry-run    # Preview changes
 *   bun backfill-direct-relations.ts              # Execute changes
 *   bun backfill-direct-relations.ts --limit=100  # Limit items processed
 */

import { query } from "@services/monday/client";

const BOARD_IDS = {
  ESTIMATING: "7943937851",
  CONTACTS: "7943937855",
  CONTRACTORS: "7943937856",
};

const COLUMNS = {
  CONTACTS_OLD: "deal_contact",
  CONTACTS_DIRECT: "board_relation_mm065k5n",
  CONTRACTORS_DIRECT: "board_relation_mkzdd0r4",
  // On Contacts board, the link to Contractor/Account
  CONTACT_CONTRACTOR: "contact_account",
};

const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)", "Sales Team Estimates"];

interface ItemColumnValue {
  id: string;
  linked_item_ids?: string[];
}

interface EstimateItem {
  id: string;
  name: string;
  group: { title: string };
  column_values: ItemColumnValue[];
}

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1]) : undefined;

async function getEstimateItems(): Promise<EstimateItem[]> {
  const allItems: EstimateItem[] = [];
  let cursor: string | null = null;

  console.log("Fetching estimates...");

  do {
    const cursorParam = cursor ? `, cursor: "${cursor}"` : "";

    const result = await query<{
      boards: Array<{
        items_page: {
          cursor: string | null;
          items: EstimateItem[];
        };
      }>;
    }>(`
      query {
        boards(ids: ${BOARD_IDS.ESTIMATING}) {
          items_page(limit: 100${cursorParam}) {
            cursor
            items {
              id
              name
              group { title }
              column_values(ids: ["${COLUMNS.CONTACTS_OLD}", "${COLUMNS.CONTACTS_DIRECT}", "${COLUMNS.CONTRACTORS_DIRECT}"]) {
                id
                ... on BoardRelationValue { linked_item_ids }
              }
            }
          }
        }
      }
    `);

    const page = result.boards[0]?.items_page;
    if (page?.items) {
      allItems.push(...page.items);
      console.log(`  Fetched ${allItems.length} items...`);
    }
    cursor = page?.cursor ?? null;

    // Filter as we go
    const realSoFar = allItems.filter(
      (item) => !SKIP_GROUPS.includes(item.group.title)
    );
    if (limit && realSoFar.length >= limit) break;
  } while (cursor);

  // Filter out shell/sales estimates
  const filtered = allItems.filter(
    (item) => !SKIP_GROUPS.includes(item.group.title)
  );
  console.log(
    `Total: ${allItems.length}, Real estimates: ${filtered.length}\n`
  );

  return limit ? filtered.slice(0, limit) : filtered;
}

async function getContactContractors(
  contactIds: string[]
): Promise<Map<string, string[]>> {
  if (contactIds.length === 0) return new Map();

  const contactToContractor = new Map<string, string[]>();
  const BATCH = 50;

  for (let i = 0; i < contactIds.length; i += BATCH) {
    const batch = contactIds.slice(i, i + BATCH);
    const idsStr = batch.join(",");

    const result = await query<{
      items: Array<{
        id: string;
        column_values: Array<{ id: string; linked_item_ids?: string[] }>;
      }>;
    }>(`
      query {
        items(ids: [${idsStr}]) {
          id
          column_values(ids: ["${COLUMNS.CONTACT_CONTRACTOR}"]) {
            id
            ... on BoardRelationValue { linked_item_ids }
          }
        }
      }
    `);

    for (const contact of result.items) {
      const contractorCol = contact.column_values.find(
        (c) => c.id === COLUMNS.CONTACT_CONTRACTOR
      );
      if (contractorCol?.linked_item_ids?.length) {
        contactToContractor.set(contact.id, contractorCol.linked_item_ids);
      }
    }
  }

  return contactToContractor;
}

async function updateItem(
  itemId: string,
  columnId: string,
  linkedIds: string[]
): Promise<void> {
  const value = JSON.stringify({ item_ids: linkedIds });

  await query(`
    mutation {
      change_column_value(
        board_id: ${BOARD_IDS.ESTIMATING}
        item_id: ${itemId}
        column_id: "${columnId}"
        value: ${JSON.stringify(value)}
      ) { id }
    }
  `);
}

async function main() {
  console.log("=".repeat(50));
  console.log("BACKFILL DIRECT RELATIONS");
  console.log("=".repeat(50));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (limit) console.log(`Limit: ${limit}`);
  console.log();

  const items = await getEstimateItems();

  // Collect all contact IDs we need to look up
  const allContactIds = new Set<string>();
  for (const item of items) {
    const contactsOld = item.column_values.find(
      (c) => c.id === COLUMNS.CONTACTS_OLD
    );
    if (contactsOld?.linked_item_ids) {
      for (const id of contactsOld.linked_item_ids) {
        allContactIds.add(id);
      }
    }
  }

  console.log(`Looking up contractors for ${allContactIds.size} contacts...`);
  const contactContractors = await getContactContractors([...allContactIds]);
  console.log(
    `Found contractor links for ${contactContractors.size} contacts\n`
  );

  const stats = {
    contactsUpdated: 0,
    contractorsUpdated: 0,
    contactsSkipped: 0,
    contractorsSkipped: 0,
    errors: 0,
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const contactsOld = item.column_values.find(
      (c) => c.id === COLUMNS.CONTACTS_OLD
    );
    const contactsDirect = item.column_values.find(
      (c) => c.id === COLUMNS.CONTACTS_DIRECT
    );
    const contractorsDirect = item.column_values.find(
      (c) => c.id === COLUMNS.CONTRACTORS_DIRECT
    );

    const hasOldContacts = contactsOld?.linked_item_ids?.length ?? 0;
    const hasDirectContacts = contactsDirect?.linked_item_ids?.length ?? 0;
    const hasDirectContractor = contractorsDirect?.linked_item_ids?.length ?? 0;

    // Update Contacts - Direct if empty but old has data
    if (hasOldContacts > 0 && hasDirectContacts === 0) {
      const contactIds = contactsOld!.linked_item_ids!;
      if (dryRun) {
        console.log(
          `[${i + 1}/${items.length}] Would set Contacts - Direct for "${item.name}" to ${contactIds.length} contact(s)`
        );
      } else {
        try {
          await updateItem(item.id, COLUMNS.CONTACTS_DIRECT, contactIds);
          console.log(
            `[${i + 1}/${items.length}] Set Contacts - Direct for "${item.name}"`
          );
        } catch (e) {
          console.error(
            `[${i + 1}/${items.length}] ERROR setting contacts for "${item.name}": ${e}`
          );
          stats.errors++;
        }
      }
      stats.contactsUpdated++;
    } else {
      stats.contactsSkipped++;
    }

    // Update Contractors - Direct if empty but we can derive from contacts
    if (hasDirectContractor === 0 && hasOldContacts > 0) {
      // Get contractor from first contact that has one
      let contractorIds: string[] = [];
      for (const contactId of contactsOld!.linked_item_ids!) {
        const contractors = contactContractors.get(contactId);
        if (contractors?.length) {
          contractorIds = contractors;
          break;
        }
      }

      if (contractorIds.length > 0) {
        if (dryRun) {
          console.log(
            `[${i + 1}/${items.length}] Would set Contractors - Direct for "${item.name}" to contractor ID ${contractorIds[0]}`
          );
        } else {
          try {
            await updateItem(
              item.id,
              COLUMNS.CONTRACTORS_DIRECT,
              contractorIds
            );
            console.log(
              `[${i + 1}/${items.length}] Set Contractors - Direct for "${item.name}"`
            );
          } catch (e) {
            console.error(
              `[${i + 1}/${items.length}] ERROR setting contractor for "${item.name}": ${e}`
            );
            stats.errors++;
          }
        }
        stats.contractorsUpdated++;
      } else {
        stats.contractorsSkipped++;
      }
    } else {
      stats.contractorsSkipped++;
    }

    // Rate limit to avoid API issues
    if (
      !dryRun &&
      (stats.contactsUpdated + stats.contractorsUpdated) % 20 === 0
    ) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("COMPLETE");
  console.log("=".repeat(50));
  console.log(
    `Contacts - Direct: ${stats.contactsUpdated} updated, ${stats.contactsSkipped} skipped`
  );
  console.log(
    `Contractors - Direct: ${stats.contractorsUpdated} updated, ${stats.contractorsSkipped} skipped`
  );
  if (stats.errors > 0) console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
