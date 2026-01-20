/**
 * Insurance Coverage Management
 *
 * Stores Desert Services' insurance limits and compares against contract requirements.
 */

import { db } from "./index";

// =============================================================================
// Schema
// =============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS company_insurance (
    id TEXT PRIMARY KEY DEFAULT 'desert-services',
    gl_each_occurrence INTEGER NOT NULL,
    gl_general_aggregate INTEGER NOT NULL,
    gl_products_completed_ops INTEGER NOT NULL,
    auto_combined_single_limit INTEGER NOT NULL,
    umbrella_each_occurrence INTEGER NOT NULL,
    umbrella_aggregate INTEGER NOT NULL,
    workers_comp_each_accident INTEGER NOT NULL,
    workers_comp_disease_employee INTEGER NOT NULL,
    workers_comp_disease_policy INTEGER NOT NULL,
    professional_liability INTEGER NOT NULL,
    policy_expiration TEXT NOT NULL,
    broker_name TEXT,
    broker_email TEXT,
    broker_phone TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS contract_insurance_requirements (
    id TEXT PRIMARY KEY,
    contract_id TEXT,
    project_name TEXT NOT NULL,
    contractor_name TEXT NOT NULL,
    gl_each_occurrence INTEGER,
    gl_general_aggregate INTEGER,
    gl_products_completed_ops INTEGER,
    auto_combined_single_limit INTEGER,
    umbrella_each_occurrence INTEGER,
    umbrella_aggregate INTEGER,
    workers_comp_each_accident INTEGER,
    professional_liability INTEGER,
    additional_insureds TEXT,
    waiver_of_subrogation INTEGER DEFAULT 0,
    primary_noncontributory INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// =============================================================================
// Types
// =============================================================================

export interface CompanyInsurance {
  gl_each_occurrence: number;
  gl_general_aggregate: number;
  gl_products_completed_ops: number;
  auto_combined_single_limit: number;
  umbrella_each_occurrence: number;
  umbrella_aggregate: number;
  workers_comp_each_accident: number;
  workers_comp_disease_employee: number;
  workers_comp_disease_policy: number;
  professional_liability: number;
  policy_expiration: string;
  broker_name?: string;
  broker_email?: string;
  broker_phone?: string;
}

export interface ContractRequirements {
  project_name: string;
  contractor_name: string;
  gl_each_occurrence?: number;
  gl_general_aggregate?: number;
  gl_products_completed_ops?: number;
  auto_combined_single_limit?: number;
  umbrella_each_occurrence?: number;
  umbrella_aggregate?: number;
  workers_comp_each_accident?: number;
  professional_liability?: number;
  additional_insureds?: string[];
  waiver_of_subrogation?: boolean;
  primary_noncontributory?: boolean;
}

export interface CoverageGap {
  field: string;
  required: number;
  have: number;
  shortfall: number;
  severity: "critical" | "warning";
}

export interface ComparisonResult {
  project_name: string;
  contractor_name: string;
  meets_requirements: boolean;
  gaps: CoverageGap[];
  warnings: string[];
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Get Desert Services' current insurance coverage
 */
export function getCompanyInsurance(): CompanyInsurance | null {
  return db
    .prepare("SELECT * FROM company_insurance WHERE id = 'desert-services'")
    .get() as CompanyInsurance | null;
}

/**
 * Update Desert Services' insurance coverage
 */
export function updateCompanyInsurance(insurance: CompanyInsurance): void {
  db.prepare(`
    INSERT OR REPLACE INTO company_insurance (
      id, gl_each_occurrence, gl_general_aggregate, gl_products_completed_ops,
      auto_combined_single_limit, umbrella_each_occurrence, umbrella_aggregate,
      workers_comp_each_accident, workers_comp_disease_employee, workers_comp_disease_policy,
      professional_liability, policy_expiration, broker_name, broker_email, broker_phone,
      updated_at
    ) VALUES (
      'desert-services', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
    )
  `).run(
    insurance.gl_each_occurrence,
    insurance.gl_general_aggregate,
    insurance.gl_products_completed_ops,
    insurance.auto_combined_single_limit,
    insurance.umbrella_each_occurrence,
    insurance.umbrella_aggregate,
    insurance.workers_comp_each_accident,
    insurance.workers_comp_disease_employee,
    insurance.workers_comp_disease_policy,
    insurance.professional_liability,
    insurance.policy_expiration,
    insurance.broker_name ?? null,
    insurance.broker_email ?? null,
    insurance.broker_phone ?? null
  );
}

/**
 * Compare contract requirements against company coverage
 */
export function checkCoverage(
  requirements: ContractRequirements
): ComparisonResult {
  const coverage = getCompanyInsurance();

  if (!coverage) {
    return {
      project_name: requirements.project_name,
      contractor_name: requirements.contractor_name,
      meets_requirements: false,
      gaps: [],
      warnings: [
        "Company insurance not configured. Run: bun scripts/setup-insurance.ts",
      ],
    };
  }

  const gaps: CoverageGap[] = [];
  const warnings: string[] = [];

  // Check each coverage type
  const checks: Array<{
    field: string;
    required: number | undefined;
    have: number;
  }> = [
    {
      field: "GL Each Occurrence",
      required: requirements.gl_each_occurrence,
      have: coverage.gl_each_occurrence,
    },
    {
      field: "GL General Aggregate",
      required: requirements.gl_general_aggregate,
      have: coverage.gl_general_aggregate,
    },
    {
      field: "GL Products/Completed Ops",
      required: requirements.gl_products_completed_ops,
      have: coverage.gl_products_completed_ops,
    },
    {
      field: "Auto Combined Single Limit",
      required: requirements.auto_combined_single_limit,
      have: coverage.auto_combined_single_limit,
    },
    {
      field: "Umbrella Each Occurrence",
      required: requirements.umbrella_each_occurrence,
      have: coverage.umbrella_each_occurrence,
    },
    {
      field: "Umbrella Aggregate",
      required: requirements.umbrella_aggregate,
      have: coverage.umbrella_aggregate,
    },
    {
      field: "Workers Comp Each Accident",
      required: requirements.workers_comp_each_accident,
      have: coverage.workers_comp_each_accident,
    },
    {
      field: "Professional Liability",
      required: requirements.professional_liability,
      have: coverage.professional_liability,
    },
  ];

  for (const check of checks) {
    if (check.required && check.have < check.required) {
      const shortfall = check.required - check.have;
      gaps.push({
        field: check.field,
        required: check.required,
        have: check.have,
        shortfall,
        severity: shortfall > 1_000_000 ? "critical" : "warning",
      });
    }
  }

  // Check policy expiration
  const expDate = new Date(coverage.policy_expiration);
  const now = new Date();
  const daysUntilExpiry = Math.floor(
    (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) {
    warnings.push(`POLICY EXPIRED on ${coverage.policy_expiration}`);
  } else if (daysUntilExpiry < 30) {
    warnings.push(
      `Policy expires in ${daysUntilExpiry} days (${coverage.policy_expiration})`
    );
  }

  return {
    project_name: requirements.project_name,
    contractor_name: requirements.contractor_name,
    meets_requirements: gaps.length === 0,
    gaps,
    warnings,
  };
}

/**
 * Format currency for display
 */
function formatMoney(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}K`;
}

/**
 * Print comparison result to console
 */
export function printComparisonResult(result: ComparisonResult): void {
  console.log(`\n=== Insurance Check: ${result.project_name} ===`);
  console.log(`Contractor: ${result.contractor_name}`);

  if (result.meets_requirements) {
    console.log("\n✅ MEETS ALL REQUIREMENTS\n");
  } else {
    console.log("\n❌ COVERAGE GAPS FOUND:\n");
    for (const gap of result.gaps) {
      const icon = gap.severity === "critical" ? "🚨" : "⚠️";
      console.log(`${icon} ${gap.field}`);
      console.log(`   Required: ${formatMoney(gap.required)}`);
      console.log(`   Have:     ${formatMoney(gap.have)}`);
      console.log(`   Short:    ${formatMoney(gap.shortfall)}`);
      console.log();
    }
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`  ⚠️  ${warning}`);
    }
    console.log();
  }
}
