/**
 * Create Desert Sky Apartments Dust Permit
 *
 * Dedicated script to create dust permit for:
 * - Project: Desert Sky Apartments
 * - Address: 6903 West Thomas Road, Phoenix, AZ 85033
 * - Company: NRP Contractors II LLC (new company)
 * - Contact: Chase Hubbert, Project Manager
 *
 * Run with: bun scripts/create-desert-sky.ts [--headed]
 */

import { parseHeadlessOverride } from "@/commands/_shared/headless";
import { buildFormData } from "@/form-data";
import { createApplicationFull } from "@/portal/create";
import { closeBrowser, createBrowser } from "@/portal/utils/browser";
import { config } from "@/portal/utils/config";
import { login } from "@/portal/utils/login";

// Parse CLI args
const { headlessOverride } = parseHeadlessOverride(process.argv.slice(2));
const headless = headlessOverride ?? config.scripts.create.headless;

// Desert Sky Apartments FormData
const DESERT_SKY_FORM_DATA = buildFormData({
  overrides: {
    // Page 1: Applicant info (new company - required)
    applicant: {
      isPropertyOwner: false,
      isDeveloper: false,
      isLessee: false,
      isGeneralContractor: true,
      entityType: "Limited Liability Company",
      companyName: "NRP Contractors II LLC",
      address1: "1228 Euclid Ave, 4th Floor",
      city: "Cleveland",
      state: "Ohio",
      zip: "44115",
      phone: "2105070736",
      email: "chubbert@nrpgroup.com",
    },
    presidentOwner: {
      firstName: "Chase",
      lastName: "Hubbert",
      address1: "1228 Euclid Ave, 4th Floor",
      city: "Cleveland",
      state: "Ohio",
      zip: "44115",
      phone: "2105070736",
      email: "chubbert@nrpgroup.com",
    },
    // Page 3: Primary contact and project
    primaryContact: {
      firstName: "Chase",
      lastName: "Hubbert",
      title: "Project Manager",
      email: "chubbert@nrpgroup.com",
      phone: "2105070736",
      companyName: "NRP Contractors II LLC",
    },
    project: {
      name: "Desert Sky Apartments",
      description:
        "288-unit apartment complex with 9 buildings, clubhouse, 3 detached garages, 34 carports, and pool",
      startDate: "01/19/2026",
      endDate: "01/19/2027",
    },
    site: {
      // Note: Address (6903 West Thomas Road, Phoenix, AZ 85033) is displayed in the form header
      // but not stored in FormData. The site name includes the address for reference.
      name: "Desert Sky Apartments - 6903 West Thomas Road",
      acresDisturbed: 9.668,
    },
  },
});

async function main() {
  console.log("\n=== DESERT SKY APARTMENTS - DUST PERMIT ===");
  console.log("Project: Desert Sky Apartments");
  console.log("Address: 6903 West Thomas Road, Phoenix, AZ 85033");
  console.log("Company: NRP Contractors II LLC (new company)");
  console.log("Contact: Chase Hubbert, Project Manager");
  console.log(`Headless: ${headless}`);
  console.log("");

  // 1. Create browser and login
  console.log("[1/3] Starting browser and logging in...");
  const instance = await createBrowser({ headless });

  try {
    const loggedIn = await login(instance.page);
    if (!loggedIn) {
      throw new Error("Login failed");
    }
    console.log("  ✓ Logged in\n");

    // 2. Run the new-company flow
    console.log("[2/3] Creating permit application...");
    const result = await createApplicationFull(
      instance.page,
      instance.context,
      "new-company",
      DESERT_SKY_FORM_DATA
    );

    // 3. Report results
    console.log("\n[3/3] Results:");
    if (result.success) {
      console.log(`  ✓ Application created: ${result.applicationId}`);
      console.log(`  ✓ Reached Page 5: ${result.reachedPage5}`);

      if (result.reachedPage5) {
        console.log("\n=== SUCCESS ===");
        console.log("Application is ready for manual review and submission.");
        console.log(`Application ID: ${result.applicationId}`);
      } else {
        console.log("\n=== PARTIAL SUCCESS ===");
        console.log("Application created but did not reach Page 5.");
        console.log("Manual intervention required.");
      }
    } else {
      console.log(`  ✗ Error: ${result.error}`);
      console.log("\n=== FAILED ===");
    }

    // Keep browser open for manual review if headed
    if (!headless && result.success) {
      console.log("\nBrowser left open for manual review.");
      console.log("Press Ctrl+C to close.");
      // biome-ignore lint/suspicious/noEmptyBlockStatements: Intentionally never resolves
      await new Promise(() => {}); // Wait indefinitely
    }
  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error(error);
    process.exit(1);
  } finally {
    if (headless) {
      await closeBrowser(instance);
    }
  }
}

main();
