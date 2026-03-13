import { afterEach, describe, expect, mock, test } from "bun:test";

const sampleRecord = {
  companyAddress: {
    address: {
      address: "5045 NORTH 12TH STREET",
      aptSuite: "SUITE 200",
      city: "PHOENIX",
      countyCode: "013",
      state: "AZ",
      zip: "85014",
    },
  },
  companyName: "STEVENS LEINWEBER CONSTRUCTION, INC.",
  conEndDate: "2026-12-31",
  conStartDate: "2026-03-01",
  facilityName: "CHANDLER BAY",
  ltfIdno: "LTF#115123",
  permitAuthCode: "AZC115123",
  rcoName: "ROBERT BUILDER",
  swpppDetails: {
    email: "jane@example.com",
    fname: "Jane",
    lname: "Doe",
    phone: "6025551212",
  },
};

const assessorModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/lib/assessor.ts"
);
const noiApiModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/api/noi.ts"
);
const noiEndpointsModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/lib/noi-endpoints.ts"
);
const noiTriageModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/lib/noi-triage.ts"
);
const dustPermitDbModuleUrl = import.meta.resolve(
  "../../../../apps/dust-permits/src/db/dust-permit.ts"
);
const actualDustPermitDb = await import(dustPermitDbModuleUrl);

function installNoiMocks(options?: {
  companyMatch?: {
    companyName: string;
    permitCount: number;
    portalCompanyId: string | null;
  } | null;
}) {
  mock.module("@dust-permits/db/dust-permit", () => ({
    ...actualDustPermitDb,
    findCompanyByName: async () => options?.companyMatch ?? null,
  }));

  mock.module("@/api/permits", () => ({
    handleCreatePermit: async () =>
      Response.json({ applicationId: "D0099999", success: true }),
  }));

  mock.module(assessorModuleUrl, () => ({
    queryParcelByCoordinates: async () => ({
      acres: 10,
      apn: "10430005",
      polygon: null,
    }),
  }));

  mock.module(noiEndpointsModuleUrl, () => ({
    isMaricopaCountyCode: () => true,
    parseNoiAcres: () => 5,
    parseNoiCoordinates: () => ({ latitude: 33.4484, longitude: -112.074 }),
    resolveNoiRecord: async () => ({
      identifier: "AZC115123",
      record: sampleRecord,
      records: [sampleRecord],
    }),
  }));

  mock.module(noiTriageModuleUrl, () => ({
    evaluateParcelAcreageDecision: () => ({
      approved: true,
      parcelAcres: 10,
      parcelTier: "2-10",
      disturbedAcres: 5,
      disturbedTier: "2-10",
      sameTier: true,
    }),
  }));
}

describe("handleResolveNoi", () => {
  afterEach(() => {
    mock.restore();
  });

  test("builds title-cased NOI payloads and keeps presidentOwner separate from the project contact", async () => {
    installNoiMocks({
      companyMatch: {
        companyName: "STEVENS LEINWEBER CONSTRUCTION, INC.",
        permitCount: 12,
        portalCompanyId: null,
      },
    });

    const { handleResolveNoi } = await import(
      `${noiApiModuleUrl}?resolve-noi-payload-${Date.now()}`
    );

    const response = await handleResolveNoi({
      identifier: "AZC115123",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.createPayload.flow).toBe("existing-company");
    expect(body.createPayload.companyName).toBe(
      "Stevens Leinweber Construction, Inc."
    );
    expect(body.createPayload.formData.applicant).toMatchObject({
      address1: "5045 North 12th Street Suite 200",
      city: "Phoenix",
      companyName: "Stevens Leinweber Construction, Inc.",
      email: "jane@example.com",
      phone: "(602) 555-1212",
      state: "AZ",
      zip: "85014",
    });
    expect(body.createPayload.formData.presidentOwner).toMatchObject({
      address1: "5045 North 12th Street Suite 200",
      city: "Phoenix",
      email: "",
      firstName: "Robert",
      lastName: "Builder",
      phone: "",
      state: "AZ",
      zip: "85014",
    });
    expect(body.createPayload.formData.primaryContact).toMatchObject({
      companyName: "Stevens Leinweber Construction, Inc.",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      phone: "(602) 555-1212",
      title: "SWPPP Contact",
    });
    expect(body.createPayload.formData.project).toMatchObject({
      name: "Chandler Bay",
    });
    expect(body.createPayload.formData.project).not.toHaveProperty("startDate");
    expect(body.createPayload.formData.project).not.toHaveProperty("endDate");
    expect(body.createPayload.formData.site).toMatchObject({
      name: "Chandler Bay",
    });
  });

  test("defaults to new-company flow before browser automation when no known company match exists", async () => {
    installNoiMocks();

    const { handleResolveNoi } = await import(
      `${noiApiModuleUrl}?resolve-noi-flow-${Date.now()}`
    );

    const response = await handleResolveNoi({
      identifier: "AZC115123",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.companyMatch).toBeNull();
    expect(body.createPayload.flow).toBe("new-company");
  });
});
