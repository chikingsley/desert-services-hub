import {
  choosePreferredAccountName,
  planAccountMerges,
  planContactMerges,
  type AccountCleanupRow,
  type AccountMergePlan,
  type ContactCleanupRow,
  type ContactMergePlan,
} from "@accounts/cleanup";
import { isLowSignalAccountName } from "@accounts/hygiene";
import { db } from "@/lib/db/client";
import { updateAccountCounts } from "@accounts/db/account";

interface Args {
  accountsOnly: boolean;
  apply: boolean;
  contactsOnly: boolean;
  json: boolean;
  limit: number | null;
  verbose: boolean;
}

interface CleanupSummary {
  accountMergesApplied: number;
  accountMergesPlanned: number;
  contactMergesApplied: number;
  contactMergesPlanned: number;
  contactSkippedGroups: number;
  mode: "apply" | "dry-run";
  sampleAccountMerges: AccountMergePlan[];
  sampleContactMerges: ContactMergePlan[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    accountsOnly: false,
    apply: false,
    contactsOnly: false,
    json: false,
    limit: null,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case "--apply":
        args.apply = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--accounts-only":
        args.accountsOnly = true;
        break;
      case "--contacts-only":
        args.contactsOnly = true;
        break;
      case "--limit": {
        const raw = argv[index + 1];
        if (!raw) {
          throw new Error("--limit requires a numeric value");
        }
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
          throw new Error("--limit must be a positive integer");
        }
        args.limit = parsed;
        index++;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.accountsOnly && args.contactsOnly) {
    throw new Error("--accounts-only and --contacts-only cannot be used together");
  }

  return args;
}

function formatCount(label: string, count: number): string {
  return `${label}: ${count}`;
}

function toJsonb(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function chooseMergedContactValue(
  current: string | null,
  incoming: string | null
): string | null {
  const currentValue = current?.trim() ?? "";
  const incomingValue = incoming?.trim() ?? "";
  if (!currentValue) {
    return incomingValue || null;
  }
  if (!incomingValue) {
    return currentValue;
  }
  if (incomingValue.length > currentValue.length + 3) {
    return incomingValue;
  }
  return currentValue;
}

function normalizeAliasCandidate(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed || isLowSignalAccountName(trimmed)) {
    return null;
  }
  return trimmed;
}

async function loadAccounts(): Promise<AccountCleanupRow[]> {
  return await db
    .query<AccountCleanupRow>(
      `SELECT
         a.id,
         a.name,
         a.domain,
         a.monday_account_id AS "mondayAccountId",
         a.monday_name AS "mondayName",
         a.pdl_enriched_at AS "pdlEnrichedAt",
         a.pdl_enrichment AS "pdlEnrichment",
         a.ssm_assignment AS "ssmAssignment",
         a.type,
         (SELECT COUNT(*)::int FROM contacts c WHERE c.account_id = a.id) AS "contactRefs",
         (SELECT COUNT(*)::int FROM emails e WHERE e.account_id = a.id) AS "emailRefs",
         (SELECT COUNT(*)::int FROM estimates est WHERE est.account_id = a.id) AS "estimateRefs",
         (SELECT COUNT(*)::int FROM projects p WHERE p.account_id = a.id) AS "projectRefs",
         (SELECT COUNT(*)::int FROM dust_permits_filed_by_desert_services dp WHERE dp.account_id = a.id) AS "dustPermitRefs",
         (SELECT COUNT(*)::int FROM swppp_work_orders wo WHERE wo.account_id = a.id) AS "swpppRefs"
       FROM accounts a`
    )
    .all();
}

async function loadContacts(): Promise<ContactCleanupRow[]> {
  return await db
    .query<ContactCleanupRow>(
      `SELECT
         c.id,
         c.monday_item_id AS "mondayItemId",
         c.name,
         c.email,
         c.phone,
         c.title,
         c.priority,
         c.account_id AS "accountId",
         c.contractor_monday_id AS "contractorMondayId",
         c.project_monday_ids AS "projectMondayIds",
         c.territory_owner AS "territoryOwner",
         c.imported_account_name AS "importedAccountName",
         c.imported_phone AS "importedPhone",
         c.contractor_matched AS "contractorMatched",
         c.phone_matched AS "phoneMatched",
         c.group_id AS "groupId",
         c.group_title AS "groupTitle",
         c.mobile_phone AS "mobilePhone",
         c.office_phone AS "officePhone",
         c.company_phone AS "companyPhone",
         c.company_fax AS "companyFax",
         c.contractor_searched_at AS "contractorSearchedAt",
         c.contractor_search_notes AS "contractorSearchNotes",
         c.synced_at AS "syncedAt",
         (SELECT COUNT(*)::int FROM contact_emails ce WHERE ce.contact_id = c.id) AS "emailLinkCount",
         (SELECT COUNT(*)::int FROM estimate_contacts ec WHERE ec.contact_id = c.id) AS "estimateLinkCount"
       FROM contacts c
       WHERE c.email IS NOT NULL
         AND trim(c.email) <> ''`
    )
    .all();
}

async function insertAlias(accountId: number, alias: string | null): Promise<void> {
  if (!alias) {
    return;
  }

  await db.run(
    `INSERT INTO company_aliases (account_id, alias)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [accountId, alias]
  );
}

async function mergeAccount(
  plan: AccountMergePlan,
  accountById: Map<number, AccountCleanupRow>
): Promise<void> {
  const source = accountById.get(plan.sourceId);
  const target = accountById.get(plan.targetId);
  if (!source || !target) {
    throw new Error(
      `Missing account rows for merge ${plan.sourceId} -> ${plan.targetId}`
    );
  }

  const mergedName = choosePreferredAccountName(target.name, source.name);

  await db.run(
    `UPDATE accounts
     SET
       name = $1,
       monday_account_id = COALESCE(monday_account_id, $2),
       monday_name = COALESCE(NULLIF(monday_name, ''), NULLIF($3, ''), NULLIF($4, '')),
       ssm_assignment = COALESCE(ssm_assignment, $5),
       pdl_enrichment = COALESCE(pdl_enrichment, $6::jsonb),
       pdl_enriched_at = COALESCE(pdl_enriched_at, $7),
       updated_at = now()
     WHERE id = $8`,
    [
      mergedName,
      source.mondayAccountId,
      source.mondayName,
      source.name,
      source.ssmAssignment,
      toJsonb(source.pdlEnrichment),
      source.pdlEnrichedAt,
      target.id,
    ]
  );

  await db.run(
    `INSERT INTO company_aliases (account_id, alias)
     SELECT $1, alias
     FROM company_aliases
     WHERE account_id = $2
     ON CONFLICT DO NOTHING`,
    [target.id, source.id]
  );

  await insertAlias(target.id, normalizeAliasCandidate(source.name));
  await insertAlias(target.id, normalizeAliasCandidate(source.mondayName));

  await db.run("UPDATE contacts SET account_id = $1 WHERE account_id = $2", [
    target.id,
    source.id,
  ]);
  await db.run("UPDATE emails SET account_id = $1 WHERE account_id = $2", [
    target.id,
    source.id,
  ]);
  await db.run("UPDATE estimates SET account_id = $1 WHERE account_id = $2", [
    target.id,
    source.id,
  ]);
  await db.run("UPDATE projects SET account_id = $1 WHERE account_id = $2", [
    target.id,
    source.id,
  ]);
  await db.run(
    "UPDATE project_match_reviews SET account_id_hint = $1 WHERE account_id_hint = $2",
    [target.id, source.id]
  );
  await db.run(
    "UPDATE dust_permits_filed_by_desert_services SET account_id = $1 WHERE account_id = $2",
    [target.id, source.id]
  );
  await db.run(
    "UPDATE swppp_work_orders SET account_id = $1 WHERE account_id = $2",
    [target.id, source.id]
  );

  await db.run("DELETE FROM accounts WHERE id = $1", [source.id]);
}

async function mergeContact(
  plan: ContactMergePlan,
  contactById: Map<number, ContactCleanupRow>
): Promise<void> {
  const source = contactById.get(plan.sourceId);
  const target = contactById.get(plan.targetId);
  if (!source || !target) {
    throw new Error(
      `Missing contact rows for merge ${plan.sourceId} -> ${plan.targetId}`
    );
  }

  await db.run(
    `UPDATE contacts
     SET
       name = $1,
       phone = COALESCE(phone, $2),
       title = COALESCE(title, $3),
       priority = COALESCE(priority, $4),
       account_id = COALESCE(account_id, $5),
       contractor_monday_id = COALESCE(contractor_monday_id, $6),
       project_monday_ids = COALESCE(project_monday_ids, $7),
       territory_owner = COALESCE(territory_owner, $8),
       imported_account_name = COALESCE(imported_account_name, $9),
       imported_phone = COALESCE(imported_phone, $10),
       contractor_matched = COALESCE(contractor_matched, $11),
       phone_matched = COALESCE(phone_matched, $12),
       group_id = COALESCE(group_id, $13),
       group_title = COALESCE(group_title, $14),
       mobile_phone = COALESCE(mobile_phone, $15),
       office_phone = COALESCE(office_phone, $16),
       company_phone = COALESCE(company_phone, $17),
       company_fax = COALESCE(company_fax, $18),
       contractor_searched_at = COALESCE(contractor_searched_at, $19),
       contractor_search_notes = COALESCE(contractor_search_notes, $20),
       synced_at = GREATEST(COALESCE(synced_at, to_timestamp(0)), COALESCE($21, to_timestamp(0))),
       updated_at = now()
     WHERE id = $22`,
    [
      chooseMergedContactValue(target.name, source.name) ?? target.name,
      source.phone,
      source.title,
      source.priority,
      source.accountId,
      source.contractorMondayId,
      source.projectMondayIds,
      source.territoryOwner,
      source.importedAccountName,
      source.importedPhone,
      source.contractorMatched,
      source.phoneMatched,
      source.groupId,
      source.groupTitle,
      source.mobilePhone,
      source.officePhone,
      source.companyPhone,
      source.companyFax,
      source.contractorSearchedAt,
      source.contractorSearchNotes,
      source.syncedAt,
      target.id,
    ]
  );

  await db.run(
    `INSERT INTO contact_emails (contact_id, email_id, relationship)
     SELECT $1, email_id, relationship
     FROM contact_emails
     WHERE contact_id = $2
     ON CONFLICT (contact_id, email_id, relationship) DO NOTHING`,
    [target.id, source.id]
  );
  await db.run("DELETE FROM contact_emails WHERE contact_id = $1", [source.id]);

  await db.run(
    `INSERT INTO estimate_contacts (estimate_id, contact_id, source)
     SELECT estimate_id, $1, source
     FROM estimate_contacts
     WHERE contact_id = $2
     ON CONFLICT (estimate_id, contact_id) DO NOTHING`,
    [target.id, source.id]
  );
  await db.run("DELETE FROM estimate_contacts WHERE contact_id = $1", [
    source.id,
  ]);

  await db.run("DELETE FROM contacts WHERE id = $1", [source.id]);
}

function logDryRunSummary(summary: CleanupSummary): void {
  console.log(summary.mode === "apply" ? "Applied cleanup." : "Dry run only.");
  console.log(formatCount("planned account merges", summary.accountMergesPlanned));
  console.log(formatCount("planned contact merges", summary.contactMergesPlanned));
  console.log(formatCount("skipped contact groups", summary.contactSkippedGroups));

  if (summary.sampleAccountMerges.length > 0) {
    console.log("\nSample account merges:");
    for (const plan of summary.sampleAccountMerges) {
      console.log(
        `  ${plan.sourceId} (${plan.sourceName} / ${plan.sourceDomain ?? "<null>"}) -> ${plan.targetId} (${plan.targetName} / ${plan.targetDomain}) [${plan.reason}]`
      );
    }
  }

  if (summary.sampleContactMerges.length > 0) {
    console.log("\nSample contact merges:");
    for (const plan of summary.sampleContactMerges) {
      console.log(
        `  ${plan.sourceId} (${plan.sourceMondayItemId}) -> ${plan.targetId} (${plan.targetMondayItemId}) [${plan.email}]`
      );
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ?? undefined;

  const accountRows = args.contactsOnly ? [] : await loadAccounts();
  const contactRows = args.accountsOnly ? [] : await loadContacts();

  const plannedAccountMerges = args.contactsOnly
    ? []
    : planAccountMerges(accountRows, { limit });
  const contactPlan = args.accountsOnly
    ? { merges: [], skippedGroups: [] }
    : planContactMerges(contactRows, { limit });

  const summary: CleanupSummary = {
    accountMergesApplied: 0,
    accountMergesPlanned: plannedAccountMerges.length,
    contactMergesApplied: 0,
    contactMergesPlanned: contactPlan.merges.length,
    contactSkippedGroups: contactPlan.skippedGroups.length,
    mode: args.apply ? "apply" : "dry-run",
    sampleAccountMerges: plannedAccountMerges.slice(0, 12),
    sampleContactMerges: contactPlan.merges.slice(0, 12),
  };

  if (!args.apply) {
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    logDryRunSummary(summary);
    return;
  }

  const accountById = new Map(accountRows.map((row) => [row.id, row]));
  const contactById = new Map(contactRows.map((row) => [row.id, row]));

  await db.transaction(async () => {
    for (const plan of plannedAccountMerges) {
      await mergeAccount(plan, accountById);
      summary.accountMergesApplied += 1;
      if (args.verbose) {
        console.log(
          `merged account ${plan.sourceId} -> ${plan.targetId} (${plan.reason})`
        );
      }
    }

    for (const plan of contactPlan.merges) {
      await mergeContact(plan, contactById);
      summary.contactMergesApplied += 1;
      if (args.verbose) {
        console.log(
          `merged contact ${plan.sourceId} -> ${plan.targetId} (${plan.email})`
        );
      }
    }

    await updateAccountCounts();
  });

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  logDryRunSummary(summary);
}

await main();
