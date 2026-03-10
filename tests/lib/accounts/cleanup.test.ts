import { describe, expect, test } from "bun:test";
import {
  choosePreferredAccountName,
  getAccountFootprint,
  planAccountMerges,
  planContactMerges,
  type AccountCleanupRow,
  type ContactCleanupRow,
} from "@accounts/cleanup";

function makeAccount(
  overrides: Partial<AccountCleanupRow>
): AccountCleanupRow {
  return {
    id: 1,
    name: "Example Contractor",
    domain: "example.com",
    mondayAccountId: null,
    mondayName: null,
    pdlEnrichedAt: null,
    pdlEnrichment: null,
    ssmAssignment: null,
    type: "contractor",
    contactRefs: 0,
    emailRefs: 0,
    estimateRefs: 0,
    projectRefs: 0,
    dustPermitRefs: 0,
    swpppRefs: 0,
    ...overrides,
  };
}

function makeContact(
  overrides: Partial<ContactCleanupRow>
): ContactCleanupRow {
  return {
    id: 1,
    mondayItemId: "email:abc123",
    name: "Example Contact",
    email: "contact@example.com",
    phone: null,
    title: null,
    priority: null,
    accountId: null,
    contractorMondayId: null,
    projectMondayIds: null,
    territoryOwner: null,
    importedAccountName: null,
    importedPhone: null,
    contractorMatched: null,
    phoneMatched: null,
    groupId: null,
    groupTitle: null,
    mobilePhone: null,
    officePhone: null,
    companyPhone: null,
    companyFax: null,
    contractorSearchedAt: null,
    contractorSearchNotes: null,
    syncedAt: null,
    emailLinkCount: 0,
    estimateLinkCount: 0,
    ...overrides,
  };
}

describe("getAccountFootprint", () => {
  test("sums linked records across account surfaces", () => {
    expect(
      getAccountFootprint(
        makeAccount({
          contactRefs: 2,
          dustPermitRefs: 1,
          emailRefs: 4,
          estimateRefs: 3,
          projectRefs: 1,
          swpppRefs: 2,
        })
      )
    ).toBe(13);
  });
});

describe("choosePreferredAccountName", () => {
  test("replaces low-signal names with better company names", () => {
    expect(
      choosePreferredAccountName("Contracts", "CHASSE Building Team")
    ).toBe("CHASSE Building Team");
  });

  test("keeps the stronger existing company name", () => {
    expect(
      choosePreferredAccountName("Willmeng Construction", "Willmeng")
    ).toBe("Willmeng Construction");
  });
});

describe("planAccountMerges", () => {
  test("merges malformed duplicate domains into the repaired canonical domain", () => {
    const plans = planAccountMerges([
      makeAccount({
        id: 24,
        name: "Willmeng Construction",
        domain: "willmeng.com",
        mondayAccountId: "9470128033",
      }),
      makeAccount({
        id: 648,
        name: "Willmeng Construction",
        domain: "willmeng.comreply",
      }),
    ]);

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      sourceId: 648,
      targetId: 24,
      reason: "same_name_repaired_domain",
      repairedDomain: "willmeng.com",
    });
  });

  test("merges low-signal accounts when the repaired domain points at a canonical record", () => {
    const plans = planAccountMerges([
      makeAccount({
        id: 22,
        name: "CHASSE Building Team",
        domain: "chasse.us",
        mondayAccountId: "9470127986",
      }),
      makeAccount({
        id: 512,
        name: "Contracts",
        domain: "chasse.uscontracts",
      }),
    ]);

    expect(plans).toHaveLength(1);
    expect(plans[0]?.reason).toBe("low_signal_name_repaired_domain");
  });

  test("skips repaired domains that resolve to a different company", () => {
    const plans = planAccountMerges([
      makeAccount({
        id: 24,
        name: "Willmeng Construction",
        domain: "willmeng.com",
      }),
      makeAccount({
        id: 2992,
        name: "Willmeng Construction",
        domain: "mesaaz.govif",
      }),
      makeAccount({
        id: 4000,
        name: "City of Mesa",
        domain: "mesaaz.gov",
      }),
    ]);

    expect(plans).toHaveLength(0);
  });
});

describe("planContactMerges", () => {
  test("upgrades synthetic contacts into the single real monday contact", () => {
    const plan = planContactMerges([
      makeContact({
        id: 10,
        mondayItemId: "email:abc123",
        accountId: 24,
        email: "adenning@willmeng.com",
      }),
      makeContact({
        id: 798,
        mondayItemId: "9470199001",
        accountId: 24,
        email: "adenning@willmeng.com",
      }),
    ]);

    expect(plan.skippedGroups).toHaveLength(0);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0]).toMatchObject({
      sourceId: 10,
      targetId: 798,
      reason: "synthetic_contact_upgraded_to_real",
    });
  });

  test("skips ambiguous groups with multiple real monday contacts", () => {
    const plan = planContactMerges([
      makeContact({
        id: 479,
        mondayItemId: "8758397413",
        email: "bids@brinkmannconstructors.com",
      }),
      makeContact({
        id: 845,
        mondayItemId: "8758397414",
        email: "bids@brinkmannconstructors.com",
      }),
    ]);

    expect(plan.merges).toHaveLength(0);
    expect(plan.skippedGroups).toEqual([
      {
        count: 2,
        email: "bids@brinkmannconstructors.com",
        realCount: 2,
        reason: "multiple_real_contacts",
      },
    ]);
  });
});
