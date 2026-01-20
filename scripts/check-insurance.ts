/**
 * Check Contract Insurance Requirements
 *
 * Usage:
 *   bun scripts/check-insurance.ts --project "AMS Mesa" --contractor "BC Construction"
 *
 * Or import and use programmatically:
 *   import { checkContractInsurance } from './scripts/check-insurance'
 */

import {
  type ContractRequirements,
  checkCoverage,
  printComparisonResult,
} from "../lib/db/insurance";

// Common GC insurance requirement templates
export const REQUIREMENT_TEMPLATES = {
  // Standard - most GCs
  standard: {
    gl_each_occurrence: 1_000_000,
    gl_general_aggregate: 2_000_000,
    auto_combined_single_limit: 1_000_000,
    umbrella_each_occurrence: 1_000_000,
    workers_comp_each_accident: 500_000,
  },

  // Mid-tier - larger GCs
  mid: {
    gl_each_occurrence: 1_000_000,
    gl_general_aggregate: 2_000_000,
    auto_combined_single_limit: 1_000_000,
    umbrella_each_occurrence: 2_000_000,
    umbrella_aggregate: 2_000_000,
    workers_comp_each_accident: 500_000,
    professional_liability: 1_000_000,
  },

  // High - big commercial / institutional
  high: {
    gl_each_occurrence: 1_000_000,
    gl_general_aggregate: 2_000_000,
    auto_combined_single_limit: 1_000_000,
    umbrella_each_occurrence: 5_000_000,
    umbrella_aggregate: 5_000_000,
    workers_comp_each_accident: 500_000,
    professional_liability: 2_000_000,
  },

  // BCCG - BC Construction Group (from AMS Mesa contract)
  bccg: {
    gl_each_occurrence: 1_000_000,
    gl_general_aggregate: 2_000_000,
    gl_products_completed_ops: 2_000_000,
    auto_combined_single_limit: 1_000_000,
    umbrella_each_occurrence: 5_000_000,
    umbrella_aggregate: 5_000_000,
    workers_comp_each_accident: 500_000,
    professional_liability: 2_000_000,
  },
} as const;

/**
 * Check a contract's insurance requirements against our coverage
 */
export function checkContractInsurance(
  projectName: string,
  contractorName: string,
  requirements: Partial<ContractRequirements>
) {
  const fullReqs: ContractRequirements = {
    project_name: projectName,
    contractor_name: contractorName,
    ...requirements,
  };

  const result = checkCoverage(fullReqs);
  printComparisonResult(result);
  return result;
}

// CLI usage
if (import.meta.main) {
  const args = process.argv.slice(2);

  // Parse args
  let project = "";
  let contractor = "";
  let template: keyof typeof REQUIREMENT_TEMPLATES = "standard";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      project = args[i + 1];
      i++;
    } else if (args[i] === "--contractor" && args[i + 1]) {
      contractor = args[i + 1];
      i++;
    } else if (args[i] === "--template" && args[i + 1]) {
      template = args[i + 1] as keyof typeof REQUIREMENT_TEMPLATES;
      i++;
    }
  }

  if (!(project && contractor)) {
    console.log(
      'Usage: bun scripts/check-insurance.ts --project "Project Name" --contractor "GC Name" [--template standard|mid|high|bccg]'
    );
    console.log("\nTemplates:");
    console.log("  standard - $1M umbrella (most GCs)");
    console.log("  mid      - $2M umbrella (larger GCs)");
    console.log("  high     - $5M umbrella (big commercial)");
    console.log("  bccg     - BC Construction Group requirements");
    console.log("\nExample:");
    console.log(
      '  bun scripts/check-insurance.ts --project "AMS Mesa" --contractor "BC Construction Group" --template bccg'
    );
    process.exit(1);
  }

  const reqs =
    REQUIREMENT_TEMPLATES[template] || REQUIREMENT_TEMPLATES.standard;
  checkContractInsurance(project, contractor, reqs);
}
