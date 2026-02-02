/**
 * Setup Desert Services Insurance Coverage
 *
 * Run: bun scripts/setup-insurance.ts
 *
 * Updates company insurance limits in the database.
 * Based on current policy with WTW (Willis Towers Watson).
 */

import {
  getCompanyInsurance,
  updateCompanyInsurance,
} from "../lib/db/insurance";

// Desert Services current coverage (as of Jan 2026)
// Source: WTW / Katie Beck confirmation
const DESERT_SERVICES_COVERAGE = {
  // General Liability
  gl_each_occurrence: 1_000_000, // $1M
  gl_general_aggregate: 2_000_000, // $2M
  gl_products_completed_ops: 2_000_000, // $2M

  // Auto
  auto_combined_single_limit: 1_000_000, // $1M

  // Umbrella / Excess
  umbrella_each_occurrence: 3_000_000, // $3M (NOT $5M)
  umbrella_aggregate: 3_000_000, // $3M

  // Workers Comp
  workers_comp_each_accident: 500_000, // $500K
  workers_comp_disease_employee: 500_000,
  workers_comp_disease_policy: 500_000,

  // Professional Liability (E&O)
  professional_liability: 2_000_000, // $2M

  // Policy Info
  policy_expiration: "2026-10-01", // UPDATE when renewed

  // Broker
  broker_name: "Katie Beck - WTW",
  broker_email: "katie.beck@wtwco.com",
  broker_phone: "(952) 842-6329",
};

// Update database
updateCompanyInsurance(DESERT_SERVICES_COVERAGE);

// Verify
const saved = getCompanyInsurance();
console.log("Desert Services Insurance Coverage Updated:\n");
console.log("General Liability:");
console.log(
  `  Each Occurrence:    $${(saved!.gl_each_occurrence / 1_000_000).toFixed(1)}M`
);
console.log(
  `  General Aggregate:  $${(saved!.gl_general_aggregate / 1_000_000).toFixed(1)}M`
);
console.log(
  `  Products/Comp Ops:  $${(saved!.gl_products_completed_ops / 1_000_000).toFixed(1)}M`
);
console.log("\nAuto:");
console.log(
  `  Combined Single:    $${(saved!.auto_combined_single_limit / 1_000_000).toFixed(1)}M`
);
console.log("\nUmbrella:");
console.log(
  `  Each Occurrence:    $${(saved!.umbrella_each_occurrence / 1_000_000).toFixed(1)}M`
);
console.log(
  `  Aggregate:          $${(saved!.umbrella_aggregate / 1_000_000).toFixed(1)}M`
);
console.log("\nWorkers Comp:");
console.log(
  `  Each Accident:      $${(saved!.workers_comp_each_accident / 1000).toFixed(0)}K`
);
console.log("\nProfessional:");
console.log(
  `  E&O:                $${(saved!.professional_liability / 1_000_000).toFixed(1)}M`
);
console.log(`\nPolicy Expires: ${saved!.policy_expiration}`);
console.log(`Broker: ${saved!.broker_name} (${saved!.broker_email})`);
