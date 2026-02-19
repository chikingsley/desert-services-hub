import { describe, expect, test } from "bun:test";
import type { DustApplicationDetail } from "../../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail";
import {
  type EvaluateOptions,
  evaluateDustApplicationDetailQA,
} from "../../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail-qa";

function buildValidDetail(
  overrides: Partial<DustApplicationDetail> = {}
): DustApplicationDetail {
  const base: DustApplicationDetail = {
    applicationId: "D1234567",
    attachments: [],
    coordinates: {
      latitude: 33.1001,
      longitude: -111.9001,
    },
    detailFields: {
      "Application #": "D1234567",
      "Project Name": "AQ Example Project",
    },
    documentLinks: ["/filestore/sample.pdf"],
    permitDocument: null,
    permitPdf: null,
    structured: {
      applicantCompany: {
        address1: "123 Main St",
        address2: "",
        city: "Mesa",
        companyName: "Acme Civil",
        email: "permits@acme.example",
        entityType: "Corporation",
        phone: "480-555-1000",
        state: "AZ",
        zip: "85201",
      },
      applicantOwner: {
        address1: "",
        address2: "",
        city: "",
        email: "",
        firstName: "",
        lastName: "",
        phone: "",
        state: "",
        zip: "",
      },
      contact: {
        email: "field.contact@acme.example",
        name: "Field Contact",
        phone: "480-555-2000",
      },
      header: {
        applicationId: "D1234567",
        companyName: "Acme Civil",
        createdDate: "01/15/2026",
        expirationDate: "02/15/2026",
        issueDate: "01/16/2026",
        projectName: "AQ Example Project",
        status: "Active",
      },
      isOwnerDeveloper: true,
      primaryContact: {
        companyName: "Acme Civil",
        email: "primary.contact@acme.example",
        fax: "",
        firstName: "Jordan",
        lastName: "Reyes",
        mobile: "480-555-3000",
        onSitePhone: "",
        title: "Project Manager",
      },
      project: {
        description: "Mass grading and utility installation",
        endDate: "03/01/2026",
        name: "AQ Example Project",
        startDate: "01/20/2026",
      },
      propertyOwnerDeveloper: null,
      siteLocation: {
        accessPoints: [{ latitude: "33.1002", longitude: "-111.9002" }],
        disturbedArea: "3.5",
        locations: [
          {
            address: "123 Main St",
            city: "Mesa",
            county: "Maricopa",
            isSelected: true,
            latitude: "33.1001",
            longitude: "-111.9001",
            parcel: "304-34-015D",
            state: "AZ",
            zip: "85201",
          },
        ],
      },
      trackoutDevices: {
        gravelPad: true,
        grizzlyRumbleGrate: false,
        other: false,
        pavedArea: false,
        wheelWash: false,
      },
      trackoutE1Answer: true,
      waterMethods: {
        hose: false,
        other: false,
        waterBuffalo: false,
        waterPull: false,
        waterTruck: true,
      },
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

function runQa(
  detailOverrides: Partial<DustApplicationDetail> = {},
  options: EvaluateOptions = {}
) {
  return evaluateDustApplicationDetailQA(
    buildValidDetail(detailOverrides),
    options
  );
}

describe("dust application detail QA", () => {
  test("passes on valid normalized detail payload", () => {
    const qa = runQa({}, { expectedApplicationId: "D1234567" });

    expect(qa.passed).toBeTrue();
    expect(qa.missingRequired).toEqual([]);
    expect(qa.ruleFailures).toEqual([]);
    expect(qa.schemaIssues).toEqual([]);
    expect(qa.summary.required.total).toBeGreaterThan(0);
    expect(qa.summary.required.coverage).toBe(1);
  });

  test("fails required catalog and rule checks when owner/developer section is missing", () => {
    const qa = runQa(
      {
        structured: {
          ...buildValidDetail().structured,
          isOwnerDeveloper: false,
          propertyOwnerDeveloper: null,
        },
      },
      { expectedApplicationId: "D1234567" }
    );

    expect(qa.passed).toBeFalse();
    expect(
      qa.missingRequired.includes("structured.propertyOwnerDeveloper.name")
    ).toBeTrue();
    expect(
      qa.ruleFailures.some(
        (failure) =>
          failure.id === "property-owner-required-when-not-owner-developer"
      )
    ).toBeTrue();
  });

  test("fails conditional trackout rule when E1 is yes but no devices are selected", () => {
    const qa = runQa({
      structured: {
        ...buildValidDetail().structured,
        trackoutDevices: {
          gravelPad: false,
          grizzlyRumbleGrate: false,
          other: false,
          pavedArea: false,
          wheelWash: false,
        },
        trackoutE1Answer: true,
      },
    });

    expect(qa.passed).toBeFalse();
    expect(
      qa.ruleFailures.some(
        (failure) => failure.id === "trackout-device-required-when-e1-yes"
      )
    ).toBeTrue();
  });

  test("records warning-only status mismatch without failing the QA result", () => {
    const qa = runQa({}, { expectedStatus: "Closed" });

    expect(qa.passed).toBeTrue();
    const mismatch = qa.ruleFailures.find(
      (failure) => failure.id === "expected-status-match"
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("warn");
  });
});
