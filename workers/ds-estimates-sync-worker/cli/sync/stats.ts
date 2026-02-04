/**
 * Show sync statistics from hub.db
 */

import { Database } from "bun:sqlite";

const HUB_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract-ui/contract/hub.db";

export function showStats(): void {
  const db = new Database(HUB_DB_PATH, { readonly: true });

  console.log("=".repeat(60));
  console.log("HUB.DB SYNC STATISTICS");
  console.log("=".repeat(60));
  console.log();

  // Estimates stats
  const estimatesTotal =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM estimates")
      .get()?.count ?? 0;

  const estimatesWithAccount =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM estimates WHERE account_monday_id IS NOT NULL"
      )
      .get()?.count ?? 0;

  const estimatesWithDomain =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM estimates WHERE account_domain IS NOT NULL"
      )
      .get()?.count ?? 0;

  const estimatesWithSharepoint =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM estimates WHERE sharepoint_url IS NOT NULL"
      )
      .get()?.count ?? 0;

  const estimatesByStatus = db
    .query<{ bid_status: string | null; count: number }, []>(
      "SELECT bid_status, COUNT(*) as count FROM estimates GROUP BY bid_status ORDER BY count DESC LIMIT 10"
    )
    .all();

  console.log("ESTIMATES");
  console.log("-".repeat(40));
  console.log(`Total: ${estimatesTotal.toLocaleString()}`);
  console.log(
    `With account link: ${estimatesWithAccount.toLocaleString()} (${Math.round((estimatesWithAccount / estimatesTotal) * 100)}%)`
  );
  console.log(
    `With domain: ${estimatesWithDomain.toLocaleString()} (${Math.round((estimatesWithDomain / estimatesTotal) * 100)}%)`
  );
  console.log(
    `With SharePoint URL: ${estimatesWithSharepoint.toLocaleString()} (${Math.round((estimatesWithSharepoint / estimatesTotal) * 100)}%)`
  );
  console.log("\nBy status:");
  for (const row of estimatesByStatus) {
    const status = row.bid_status ?? "(null)";
    console.log(`  ${status}: ${row.count.toLocaleString()}`);
  }
  console.log();

  // Contacts stats
  const contactsTotal =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM contacts")
      .get()?.count ?? 0;

  if (contactsTotal > 0) {
    const contactsWithContractor =
      db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM contacts WHERE contractor_monday_id IS NOT NULL"
        )
        .get()?.count ?? 0;

    const contactsWithEmail =
      db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM contacts WHERE email IS NOT NULL AND email != ''"
        )
        .get()?.count ?? 0;

    const contactsWithPhone =
      db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM contacts WHERE phone IS NOT NULL AND phone != ''"
        )
        .get()?.count ?? 0;

    console.log("CONTACTS");
    console.log("-".repeat(40));
    console.log(`Total: ${contactsTotal.toLocaleString()}`);
    console.log(
      `With contractor link: ${contactsWithContractor.toLocaleString()} (${Math.round((contactsWithContractor / contactsTotal) * 100)}%)`
    );
    console.log(
      `With email: ${contactsWithEmail.toLocaleString()} (${Math.round((contactsWithEmail / contactsTotal) * 100)}%)`
    );
    console.log(
      `With phone: ${contactsWithPhone.toLocaleString()} (${Math.round((contactsWithPhone / contactsTotal) * 100)}%)`
    );
    console.log();
  }

  // Accounts/Contractors stats
  const accountsTotal =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM accounts")
      .get()?.count ?? 0;

  const accountsWithMondayId =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM accounts WHERE monday_account_id IS NOT NULL"
      )
      .get()?.count ?? 0;

  const accountsWithDomain =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM accounts WHERE domain IS NOT NULL AND domain != ''"
      )
      .get()?.count ?? 0;

  const accountsByType = db
    .query<{ account_type: string | null; count: number }, []>(
      "SELECT account_type, COUNT(*) as count FROM accounts WHERE monday_account_id IS NOT NULL GROUP BY account_type ORDER BY count DESC LIMIT 10"
    )
    .all();

  console.log("ACCOUNTS (Contractors)");
  console.log("-".repeat(40));
  console.log(`Total: ${accountsTotal.toLocaleString()}`);
  console.log(
    `With Monday ID: ${accountsWithMondayId.toLocaleString()} (${Math.round((accountsWithMondayId / accountsTotal) * 100)}%)`
  );
  console.log(
    `With domain: ${accountsWithDomain.toLocaleString()} (${Math.round((accountsWithDomain / accountsTotal) * 100)}%)`
  );
  if (accountsByType.length > 0 && accountsByType[0]?.account_type) {
    console.log("\nBy account type:");
    for (const row of accountsByType) {
      const type = row.account_type ?? "(null)";
      console.log(`  ${type}: ${row.count.toLocaleString()}`);
    }
  }
  console.log();

  // Emails stats (existing)
  const emailsTotal =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM emails")
      .get()?.count ?? 0;

  console.log("EMAILS");
  console.log("-".repeat(40));
  console.log(`Total: ${emailsTotal.toLocaleString()}`);

  db.close();
}
