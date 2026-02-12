#!/usr/bin/env bun

/**
 * Notifications — Seed Stakeholders
 *
 * Populates default stakeholder configuration from known business rules.
 *
 * Usage:
 *   bun cli/seed-stakeholders.ts
 */

import type { NotificationEventType } from "@lib/db/types";
import { addStakeholder } from "@/apps/workers/notifications/lib/stakeholders";

const SEEDS: Array<{
  event: NotificationEventType;
  email: string;
  name: string;
  role: string;
}> = [
  // Dust permit billing — TO recipients
  {
    event: "dust_permit_billing",
    email: "eva@desertservices.net",
    name: "Eva",
    role: "billing-to",
  },
  {
    event: "dust_permit_billing",
    email: "jayson@desertservices.net",
    name: "Jayson",
    role: "billing-to",
  },
  // Dust permit billing — CC recipients
  {
    event: "dust_permit_billing",
    email: "don@desertservices.net",
    name: "Don",
    role: "billing-cc",
  },
  {
    event: "dust_permit_billing",
    email: "francine@desertservices.net",
    name: "Francine",
    role: "billing-cc",
  },
  {
    event: "dust_permit_billing",
    email: "kendra@desertservices.net",
    name: "Kendra",
    role: "billing-cc",
  },

  // Dust permit submitted/issued — operations team
  {
    event: "dust_permit_submitted",
    email: "chi@desertservices.net",
    name: "Chi",
    role: "operations",
  },
  {
    event: "dust_permit_issued",
    email: "chi@desertservices.net",
    name: "Chi",
    role: "operations",
  },
  {
    event: "dust_permit_expiring",
    email: "chi@desertservices.net",
    name: "Chi",
    role: "operations",
  },
  {
    event: "dust_permit_expiring",
    email: "kendra@desertservices.net",
    name: "Kendra",
    role: "operations",
  },

  // Estimate won — contracts team
  {
    event: "estimate_won",
    email: "chi@desertservices.net",
    name: "Chi",
    role: "contracts",
  },
  {
    event: "estimate_won",
    email: "contracts@desertservices.net",
    name: "Contracts",
    role: "contracts",
  },

  // Contract received
  {
    event: "contract_received",
    email: "chi@desertservices.net",
    name: "Chi",
    role: "contracts",
  },
  {
    event: "contract_received",
    email: "contracts@desertservices.net",
    name: "Contracts",
    role: "contracts",
  },
  {
    event: "contract_packet_sla_breached",
    email: "chi@desertservices.net",
    name: "Chi",
    role: "contracts",
  },
  {
    event: "contract_packet_sla_breached",
    email: "contracts@desertservices.net",
    name: "Contracts",
    role: "contracts",
  },
];

console.log("Seeding stakeholders...\n");

for (const s of SEEDS) {
  await addStakeholder(s.event, s.email, s.name, s.role);
  console.log(`  [${s.event}] ${s.name} <${s.email}> (${s.role})`);
}

console.log(`\nDone. ${SEEDS.length} stakeholders seeded.`);
