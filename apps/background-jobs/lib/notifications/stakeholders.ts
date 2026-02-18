/**
 * Stakeholder Management
 *
 * Static notification recipient configuration.
 * Previously DB-backed (stakeholders table), now hardcoded since
 * the routing was always seeded from a static list.
 */

import type { NotificationEventType } from "@lib/db/types";
import type { StakeholderRecipient } from "./types";

const STAKEHOLDER_MAP: Record<string, StakeholderRecipient[]> = {
  dust_permit_billing: [
    { email: "eva@desertservices.net", name: "Eva", role: "billing-to" },
    { email: "jayson@desertservices.net", name: "Jayson", role: "billing-to" },
    { email: "don@desertservices.net", name: "Don", role: "billing-cc" },
    {
      email: "francine@desertservices.net",
      name: "Francine",
      role: "billing-cc",
    },
    { email: "kendra@desertservices.net", name: "Kendra", role: "billing-cc" },
  ],
  dust_permit_submitted: [
    { email: "chi@desertservices.net", name: "Chi", role: "operations" },
  ],
  dust_permit_issued: [
    { email: "chi@desertservices.net", name: "Chi", role: "operations" },
  ],
  dust_permit_expiring: [
    { email: "chi@desertservices.net", name: "Chi", role: "operations" },
    { email: "kendra@desertservices.net", name: "Kendra", role: "operations" },
  ],
  estimate_won: [
    { email: "chi@desertservices.net", name: "Chi", role: "contracts" },
    {
      email: "contracts@desertservices.net",
      name: "Contracts",
      role: "contracts",
    },
  ],
  contract_received: [
    { email: "chi@desertservices.net", name: "Chi", role: "contracts" },
    {
      email: "contracts@desertservices.net",
      name: "Contracts",
      role: "contracts",
    },
  ],
};

export function getStakeholders(
  eventType: NotificationEventType
): StakeholderRecipient[] {
  return STAKEHOLDER_MAP[eventType] ?? [];
}

export function listAllStakeholders(): Array<{
  eventType: string;
  email: string;
  name: string | null;
  role: string | null;
}> {
  const result: Array<{
    eventType: string;
    email: string;
    name: string | null;
    role: string | null;
  }> = [];
  for (const [eventType, recipients] of Object.entries(STAKEHOLDER_MAP)) {
    for (const r of recipients) {
      result.push({ eventType, email: r.email, name: r.name, role: r.role });
    }
  }
  return result;
}
