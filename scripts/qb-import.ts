#!/usr/bin/env bun
/**
 * QuickBooks Customer/Job Import & Reconciliation
 *
 * Imports QB customer/job data from CSV into Postgres,
 * then matches customers -> accounts and jobs -> projects.
 *
 * Usage:
 *   bun scripts/qb-import.ts                  # import + match + report
 *   bun scripts/qb-import.ts --dry-run        # import data, print matches without writing FKs
 *   bun scripts/qb-import.ts --report-only    # skip import, just show current state
 *   bun scripts/qb-import.ts --csv path.csv   # use a different CSV file
 */
import { db } from "@lib/db/client"

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const reportOnly = args.includes("--report-only")
const csvIdx = args.indexOf("--csv")
const csvPath = csvIdx !== -1 && args[csvIdx + 1]
  ? args[csvIdx + 1]
  : `${import.meta.dir}/../gb_customers_jobs.csv`

// ---------------------------------------------------------------------------
// CSV Parser (handles quoted fields with embedded commas)
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

function parseDomain(email: string | undefined): string | null {
  if (!email) return null
  // Handle multiple emails separated by ;
  const first = email.split(";")[0].trim()
  const at = first.lastIndexOf("@")
  if (at === -1) return null
  return first.slice(at + 1).toLowerCase()
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QBRow {
  customer: string
  jobName: string
  balance: number
  balanceTotal: number
  email: string | null
  billTo1: string | null
  billTo2: string | null
  billTo3: string | null
  billTo4: string | null
}

interface QBCustomer {
  name: string
  email: string | null
  domain: string | null
  billTo1: string | null
  billTo2: string | null
  billTo3: string | null
  billTo4: string | null
  jobCount: number
  totalBalance: number
}

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

async function createTables(): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS qb_customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      email TEXT,
      domain TEXT,
      bill_to_1 TEXT,
      bill_to_2 TEXT,
      bill_to_3 TEXT,
      bill_to_4 TEXT,
      job_count INTEGER DEFAULT 0,
      total_balance NUMERIC(12,2) DEFAULT 0,
      account_id INTEGER REFERENCES accounts(id),
      match_method TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS qb_jobs (
      id SERIAL PRIMARY KEY,
      qb_customer_id INTEGER NOT NULL REFERENCES qb_customers(id) ON DELETE CASCADE,
      job_name TEXT NOT NULL,
      balance NUMERIC(12,2) DEFAULT 0,
      balance_total NUMERIC(12,2) DEFAULT 0,
      project_id INTEGER REFERENCES projects(id),
      match_method TEXT,
      match_score REAL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(qb_customer_id, job_name)
    )
  `)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_qb_customers_account ON qb_customers(account_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_qb_customers_domain ON qb_customers(domain)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_qb_jobs_customer ON qb_jobs(qb_customer_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_qb_jobs_project ON qb_jobs(project_id)`)

  console.log("  Tables ready")
}

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

async function importCSV(): Promise<void> {
  const file = Bun.file(csvPath)
  if (!await file.exists()) {
    console.error(`CSV not found: ${csvPath}`)
    process.exit(1)
  }

  const text = await file.text()
  const lines = text.trim().split("\n")
  const header = parseCSVLine(lines[0])
  console.log(`  CSV columns: ${header.join(" | ")}`)

  // Parse all rows
  const rows: QBRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i])
    if (fields.length < 5) continue
    rows.push({
      customer: fields[0],
      jobName: fields[1],
      balance: Number.parseFloat(fields[2]) || 0,
      balanceTotal: Number.parseFloat(fields[3]) || 0,
      email: fields[4] || null,
      billTo1: fields[5] || null,
      billTo2: fields[6] || null,
      billTo3: fields[7] || null,
      billTo4: fields[8] || null,
    })
  }

  console.log(`  Parsed ${rows.length} job rows`)

  // Group by customer
  const customerMap = new Map<string, QBCustomer>()
  for (const row of rows) {
    const existing = customerMap.get(row.customer)
    if (existing) {
      existing.jobCount++
      existing.totalBalance += row.balance
      if (!existing.email && row.email) {
        existing.email = row.email
        existing.domain = parseDomain(row.email ?? undefined)
      }
    } else {
      customerMap.set(row.customer, {
        name: row.customer,
        email: row.email,
        domain: parseDomain(row.email ?? undefined),
        billTo1: row.billTo1,
        billTo2: row.billTo2,
        billTo3: row.billTo3,
        billTo4: row.billTo4,
        jobCount: 1,
        totalBalance: row.balance,
      })
    }
  }

  const customers = [...customerMap.values()]
  console.log(`  ${customers.length} unique customers`)

  // Upsert customers
  for (const c of customers) {
    await db.run(
      `INSERT INTO qb_customers (name, email, domain, bill_to_1, bill_to_2, bill_to_3, bill_to_4, job_count, total_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (name) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, qb_customers.email),
         domain = COALESCE(EXCLUDED.domain, qb_customers.domain),
         bill_to_1 = COALESCE(EXCLUDED.bill_to_1, qb_customers.bill_to_1),
         bill_to_2 = COALESCE(EXCLUDED.bill_to_2, qb_customers.bill_to_2),
         bill_to_3 = COALESCE(EXCLUDED.bill_to_3, qb_customers.bill_to_3),
         bill_to_4 = COALESCE(EXCLUDED.bill_to_4, qb_customers.bill_to_4),
         job_count = EXCLUDED.job_count,
         total_balance = EXCLUDED.total_balance,
         updated_at = now()`,
      [c.name, c.email, c.domain, c.billTo1, c.billTo2, c.billTo3, c.billTo4, c.jobCount, c.totalBalance]
    )
  }
  console.log(`  Customers upserted: ${customers.length}`)

  // Upsert jobs
  const customerIdMap = new Map<string, number>()
  const allCusts = await db.query<{ id: number; name: string }>(
    "SELECT id, name FROM qb_customers"
  ).all()
  for (const c of allCusts) {
    customerIdMap.set(c.name, c.id)
  }

  let jobCount = 0
  for (const row of rows) {
    const custId = customerIdMap.get(row.customer)
    if (!custId) {
      console.error(`  WARNING: no qb_customer_id for "${row.customer}"`)
      continue
    }
    await db.run(
      `INSERT INTO qb_jobs (qb_customer_id, job_name, balance, balance_total)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (qb_customer_id, job_name) DO UPDATE SET
         balance = EXCLUDED.balance,
         balance_total = EXCLUDED.balance_total`,
      [custId, row.jobName, row.balance, row.balanceTotal]
    )
    jobCount++
  }
  console.log(`  Jobs upserted: ${jobCount}`)
}

// ---------------------------------------------------------------------------
// Customer -> Account Matching (3-pass)
// ---------------------------------------------------------------------------

async function matchCustomers(): Promise<void> {
  // Clear previous auto-matches (preserve manual)
  if (!dryRun) {
    await db.run(`UPDATE qb_customers SET account_id = NULL, match_method = NULL WHERE match_method IS DISTINCT FROM 'manual'`)
  }

  // Pass 1: Domain match
  if (dryRun) {
    const preview = await db.query<{ qb_name: string; account_name: string; domain: string }>(
      `SELECT qc.name as qb_name, a.name as account_name, qc.domain
       FROM qb_customers qc
       JOIN accounts a ON qc.domain = a.domain
       WHERE qc.account_id IS NULL AND qc.domain IS NOT NULL`
    ).all()
    console.log(`  [DRY RUN] Pass 1 (domain): would match ${preview.length} customers`)
    if (preview.length > 0 && preview.length <= 20) {
      for (const r of preview) console.log(`    ${r.qb_name}  ->  ${r.account_name} (${r.domain})`)
    }
  } else {
    const result = await db.run(
      `UPDATE qb_customers SET
         account_id = sub.aid,
         match_method = 'domain',
         updated_at = now()
       FROM (
         SELECT DISTINCT ON (qc.id) qc.id as qcid, a.id as aid
         FROM qb_customers qc
         JOIN accounts a ON qc.domain = a.domain
         WHERE qc.account_id IS NULL AND qc.domain IS NOT NULL
         ORDER BY qc.id, a.email_count DESC
       ) sub
       WHERE qb_customers.id = sub.qcid`
    )
    const count = (result as unknown as { count: number }).count ?? 0
    console.log(`  Pass 1 (domain): matched ${count} customers`)
  }

  // Pass 2: Exact name match
  if (dryRun) {
    const preview = await db.query<{ qb_name: string; account_name: string }>(
      `SELECT qc.name as qb_name, a.name as account_name
       FROM qb_customers qc
       JOIN accounts a ON LOWER(TRIM(qc.name)) = LOWER(TRIM(a.name))
       WHERE qc.account_id IS NULL`
    ).all()
    console.log(`  [DRY RUN] Pass 2 (exact name): would match ${preview.length} customers`)
    if (preview.length > 0 && preview.length <= 20) {
      for (const r of preview) console.log(`    ${r.qb_name}  ->  ${r.account_name}`)
    }
  } else {
    const result = await db.run(
      `UPDATE qb_customers SET
         account_id = sub.aid,
         match_method = 'exact_name',
         updated_at = now()
       FROM (
         SELECT DISTINCT ON (qc.id) qc.id as qcid, a.id as aid
         FROM qb_customers qc
         JOIN accounts a ON LOWER(TRIM(qc.name)) = LOWER(TRIM(a.name))
         WHERE qc.account_id IS NULL
         ORDER BY qc.id, a.email_count DESC
       ) sub
       WHERE qb_customers.id = sub.qcid`
    )
    const count = (result as unknown as { count: number }).count ?? 0
    console.log(`  Pass 2 (exact name): matched ${count} customers`)
  }

  // Pass 3: Alias match
  if (dryRun) {
    const preview = await db.query<{ qb_name: string; alias: string; account_id: number }>(
      `SELECT qc.name as qb_name, ca.alias, ca.account_id
       FROM qb_customers qc
       JOIN company_aliases ca ON LOWER(TRIM(qc.name)) = LOWER(ca.alias)
       WHERE qc.account_id IS NULL`
    ).all()
    console.log(`  [DRY RUN] Pass 3 (alias): would match ${preview.length} customers`)
    if (preview.length > 0 && preview.length <= 20) {
      for (const r of preview) console.log(`    ${r.qb_name}  ->  account_id ${r.account_id} (alias: ${r.alias})`)
    }
  } else {
    const result = await db.run(
      `UPDATE qb_customers SET
         account_id = sub.aid,
         match_method = 'alias',
         updated_at = now()
       FROM (
         SELECT DISTINCT ON (qc.id) qc.id as qcid, ca.account_id as aid
         FROM qb_customers qc
         JOIN company_aliases ca ON LOWER(TRIM(qc.name)) = LOWER(ca.alias)
         WHERE qc.account_id IS NULL
         ORDER BY qc.id, ca.account_id
       ) sub
       WHERE qb_customers.id = sub.qcid`
    )
    const count = (result as unknown as { count: number }).count ?? 0
    console.log(`  Pass 3 (alias): matched ${count} customers`)
  }
}

// ---------------------------------------------------------------------------
// Job -> Project Matching (2-pass)
// ---------------------------------------------------------------------------

async function matchJobs(): Promise<void> {
  if (!dryRun) {
    await db.run(`UPDATE qb_jobs SET project_id = NULL, match_method = NULL, match_score = NULL WHERE match_method IS DISTINCT FROM 'manual'`)
  }

  // Pass 1: Exact name match within same account
  if (dryRun) {
    const preview = await db.query<{ job_name: string; project_name: string; customer: string }>(
      `SELECT j.job_name, p.name as project_name, qc.name as customer
       FROM qb_jobs j
       JOIN qb_customers qc ON j.qb_customer_id = qc.id
       JOIN projects p ON qc.account_id = p.account_id
         AND LOWER(TRIM(j.job_name)) = LOWER(TRIM(p.name))
       WHERE j.project_id IS NULL AND qc.account_id IS NOT NULL`
    ).all()
    console.log(`  [DRY RUN] Pass 1 (exact name): would match ${preview.length} jobs`)
    if (preview.length > 0 && preview.length <= 15) {
      for (const r of preview) console.log(`    [${r.customer}] ${r.job_name}  ->  ${r.project_name}`)
    }
  } else {
    const result = await db.run(
      `UPDATE qb_jobs SET
         project_id = sub.pid,
         match_method = 'exact_name',
         match_score = 1.0
       FROM (
         SELECT DISTINCT ON (j.id) j.id as jid, p.id as pid
         FROM qb_jobs j
         JOIN qb_customers qc ON j.qb_customer_id = qc.id
         JOIN projects p ON qc.account_id = p.account_id
           AND LOWER(TRIM(j.job_name)) = LOWER(TRIM(p.name))
         WHERE j.project_id IS NULL AND qc.account_id IS NOT NULL
         ORDER BY j.id, p.updated_at DESC
       ) sub
       WHERE qb_jobs.id = sub.jid`
    )
    const count = (result as unknown as { count: number }).count ?? 0
    console.log(`  Pass 1 (exact name): matched ${count} jobs`)
  }

  // Pass 2: Trigram similarity > 0.3 within same account
  if (dryRun) {
    const preview = await db.query<{ job_name: string; project_name: string; sim: number; customer: string }>(
      `SELECT DISTINCT ON (j.id) j.job_name, p.name as project_name,
              similarity(LOWER(j.job_name), LOWER(p.name)) as sim,
              qc.name as customer
       FROM qb_jobs j
       JOIN qb_customers qc ON j.qb_customer_id = qc.id
       JOIN projects p ON qc.account_id = p.account_id
       WHERE j.project_id IS NULL AND qc.account_id IS NOT NULL
         AND similarity(LOWER(j.job_name), LOWER(p.name)) > 0.3
       ORDER BY j.id, sim DESC`
    ).all()
    console.log(`  [DRY RUN] Pass 2 (fuzzy >0.3): would match ${preview.length} jobs`)
    for (const r of preview.slice(0, 15)) {
      console.log(`    [${r.customer}] "${r.job_name}" -> "${r.project_name}" (sim=${Number(r.sim).toFixed(2)})`)
    }
    if (preview.length > 15) console.log(`    ... and ${preview.length - 15} more`)
  } else {
    const result = await db.run(
      `UPDATE qb_jobs SET
         project_id = sub.pid,
         match_method = 'fuzzy',
         match_score = sub.sim
       FROM (
         SELECT DISTINCT ON (j.id) j.id as jid, p.id as pid,
                similarity(LOWER(j.job_name), LOWER(p.name)) as sim
         FROM qb_jobs j
         JOIN qb_customers qc ON j.qb_customer_id = qc.id
         JOIN projects p ON qc.account_id = p.account_id
         WHERE j.project_id IS NULL AND qc.account_id IS NOT NULL
           AND similarity(LOWER(j.job_name), LOWER(p.name)) > 0.3
         ORDER BY j.id, sim DESC
       ) sub
       WHERE qb_jobs.id = sub.jid`
    )
    const count = (result as unknown as { count: number }).count ?? 0
    console.log(`  Pass 2 (fuzzy >0.3): matched ${count} jobs`)
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

async function report(): Promise<void> {
  const totalCustomers = await db.query<{ count: number }>("SELECT count(*)::int as count FROM qb_customers").get()
  const matchedCustomers = await db.query<{ count: number }>("SELECT count(*)::int as count FROM qb_customers WHERE account_id IS NOT NULL").get()
  const totalJobs = await db.query<{ count: number }>("SELECT count(*)::int as count FROM qb_jobs").get()
  const matchedJobs = await db.query<{ count: number }>("SELECT count(*)::int as count FROM qb_jobs WHERE project_id IS NOT NULL").get()

  const methodBreakdown = await db.query<{ match_method: string; count: number }>(
    "SELECT COALESCE(match_method, 'unmatched') as match_method, count(*)::int as count FROM qb_customers GROUP BY match_method ORDER BY count DESC"
  ).all()

  const totalBalance = await db.query<{ total: number }>("SELECT COALESCE(sum(total_balance), 0)::float as total FROM qb_customers").get()
  const matchedBalance = await db.query<{ total: number }>("SELECT COALESCE(sum(total_balance), 0)::float as total FROM qb_customers WHERE account_id IS NOT NULL").get()

  console.log("\n========================================")
  console.log("  QB IMPORT REPORT")
  console.log("========================================\n")

  console.log(`  CUSTOMERS: ${matchedCustomers?.count ?? 0} / ${totalCustomers?.count ?? 0} matched (${totalCustomers?.count ? Math.round(((matchedCustomers?.count ?? 0) / totalCustomers.count) * 100) : 0}%)`)
  console.log(`  JOBS:      ${matchedJobs?.count ?? 0} / ${totalJobs?.count ?? 0} matched (${totalJobs?.count ? Math.round(((matchedJobs?.count ?? 0) / totalJobs.count) * 100) : 0}%)`)
  console.log(`  BALANCE:   $${(matchedBalance?.total ?? 0).toLocaleString()} / $${(totalBalance?.total ?? 0).toLocaleString()} matched\n`)

  console.log("  Match method breakdown (customers):")
  for (const m of methodBreakdown) {
    console.log(`    ${m.match_method.padEnd(12)} ${m.count}`)
  }

  const jobMethodBreakdown = await db.query<{ match_method: string; count: number }>(
    "SELECT COALESCE(match_method, 'unmatched') as match_method, count(*)::int as count FROM qb_jobs GROUP BY match_method ORDER BY count DESC"
  ).all()
  console.log("\n  Match method breakdown (jobs):")
  for (const m of jobMethodBreakdown) {
    console.log(`    ${m.match_method.padEnd(12)} ${m.count}`)
  }

  // Top unmatched by balance
  const unmatched = await db.query<{ name: string; email: string | null; domain: string | null; total_balance: number; job_count: number }>(
    `SELECT name, email, domain, total_balance::float, job_count
     FROM qb_customers WHERE account_id IS NULL
     ORDER BY total_balance DESC LIMIT 25`
  ).all()

  if (unmatched.length > 0) {
    console.log(`\n  TOP UNMATCHED CUSTOMERS (by balance):`)
    console.log(`  ${"Name".padEnd(45)} ${"Balance".padStart(12)} ${"Jobs".padStart(5)} ${"Email".padEnd(30)}`)
    console.log(`  ${"-".repeat(95)}`)
    for (const u of unmatched) {
      const bal = `$${u.total_balance.toLocaleString()}`
      console.log(`  ${u.name.slice(0, 44).padEnd(45)} ${bal.padStart(12)} ${String(u.job_count).padStart(5)} ${(u.email ?? "-").slice(0, 29).padEnd(30)}`)
    }
  }

  console.log("\n========================================\n")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\nQB Import ${dryRun ? "(DRY RUN)" : reportOnly ? "(REPORT ONLY)" : ""}\n`)

  if (!reportOnly) {
    console.log("[1/5] Creating tables...")
    await createTables()

    console.log("[2/5] Importing CSV...")
    await importCSV()

    console.log("[3/5] Matching customers -> accounts...")
    await matchCustomers()

    console.log("[4/5] Matching jobs -> projects...")
    await matchJobs()
  }

  console.log(reportOnly ? "[1/1] Generating report..." : "[5/5] Generating report...")
  await report()
}

await main()
process.exit(0)
