import type { DustApplicationDetail } from "./dust-application-detail";
import { DUST_APPLICATION_DETAIL_CONTRACT_SCHEMA } from "./dust-application-detail-qa-contract";

const COORD_TOLERANCE_DEGREES = 0.0005;
const QA_PARSER_VERSION = "1";

type Severity = "error" | "warn";

interface FieldCatalogEntry {
  path: string;
  requiredWhen?: (detail: DustApplicationDetail) => boolean;
  tier: "optional" | "required";
}

interface ConditionalRule {
  fields: string[];
  id: string;
  message: string;
  severity: Severity;
  test: (detail: DustApplicationDetail, options: EvaluateOptions) => boolean;
  when?: (detail: DustApplicationDetail, options: EvaluateOptions) => boolean;
}

export interface EvaluateOptions {
  expectedApplicationId?: string;
  expectedStatus?: string | null;
}

export interface DustApplicationDetailQAIssue {
  fields: string[];
  id: string;
  message: string;
  severity: Severity;
}

export interface DustApplicationDetailQAResult {
  applicationId: string;
  checkedAt: string;
  missingOptional: string[];
  missingRequired: string[];
  parserVersion: string;
  passed: boolean;
  ruleFailures: DustApplicationDetailQAIssue[];
  schemaIssues: DustApplicationDetailQAIssue[];
  summary: {
    conditionalRules: {
      active: number;
      failed: number;
      passed: number;
    };
    counts: {
      attachments: number;
      accessPointRows: number;
      detailFields: number;
      documentLinks: number;
      locationRows: number;
      permitPdfEmails: number;
    };
    optional: {
      coverage: number;
      missing: number;
      present: number;
      total: number;
    };
    required: {
      coverage: number;
      missing: number;
      present: number;
      total: number;
    };
  };
}

const FIELD_CATALOG: readonly FieldCatalogEntry[] = [
  { path: "structured.header.applicationId", tier: "required" },
  { path: "structured.header.projectName", tier: "required" },
  { path: "structured.header.status", tier: "required" },
  { path: "structured.header.createdDate", tier: "required" },
  { path: "structured.header.expirationDate", tier: "required" },
  { path: "structured.project.name", tier: "required" },
  { path: "structured.project.startDate", tier: "required" },
  { path: "structured.project.endDate", tier: "required" },
  { path: "structured.applicantCompany.companyName", tier: "required" },
  { path: "structured.applicantCompany.address1", tier: "required" },
  { path: "structured.applicantCompany.city", tier: "required" },
  { path: "structured.applicantCompany.state", tier: "required" },
  { path: "structured.applicantCompany.zip", tier: "required" },
  { path: "structured.primaryContact.firstName", tier: "required" },
  { path: "structured.primaryContact.lastName", tier: "required" },
  { path: "structured.siteLocation.disturbedArea", tier: "required" },
  { path: "structured.siteLocation.locations", tier: "required" },
  {
    path: "structured.propertyOwnerDeveloper.name",
    requiredWhen: (detail) => detail.structured.isOwnerDeveloper === false,
    tier: "required",
  },
  {
    path: "structured.propertyOwnerDeveloper.address1",
    requiredWhen: (detail) => detail.structured.isOwnerDeveloper === false,
    tier: "required",
  },
  {
    path: "structured.propertyOwnerDeveloper.city",
    requiredWhen: (detail) => detail.structured.isOwnerDeveloper === false,
    tier: "required",
  },
  {
    path: "structured.propertyOwnerDeveloper.state",
    requiredWhen: (detail) => detail.structured.isOwnerDeveloper === false,
    tier: "required",
  },
  {
    path: "structured.propertyOwnerDeveloper.zip",
    requiredWhen: (detail) => detail.structured.isOwnerDeveloper === false,
    tier: "required",
  },
  { path: "structured.header.companyName", tier: "optional" },
  { path: "structured.header.issueDate", tier: "optional" },
  { path: "structured.project.description", tier: "optional" },
  { path: "structured.contact.name", tier: "optional" },
  { path: "structured.contact.phone", tier: "optional" },
  { path: "structured.contact.email", tier: "optional" },
  { path: "structured.applicantCompany.phone", tier: "optional" },
  { path: "structured.applicantCompany.email", tier: "optional" },
  { path: "structured.primaryContact.title", tier: "optional" },
  { path: "structured.primaryContact.companyName", tier: "optional" },
  { path: "structured.primaryContact.email", tier: "optional" },
  { path: "structured.primaryContact.mobile", tier: "optional" },
  { path: "structured.primaryContact.onSitePhone", tier: "optional" },
  { path: "structured.primaryContact.fax", tier: "optional" },
  { path: "permitDocument.url", tier: "optional" },
  { path: "permitPdf.fields.primaryContact.email", tier: "optional" },
  { path: "permitPdf.fields.permitContactEmail", tier: "optional" },
  { path: "detailFields", tier: "optional" },
  { path: "documentLinks", tier: "optional" },
] as const;

const CONDITIONAL_RULES: readonly ConditionalRule[] = [
  {
    fields: ["structured.header.applicationId", "applicationId"],
    id: "application-id-match",
    message: "Header application ID should match parsed application ID.",
    severity: "error",
    test: (detail) =>
      detail.structured.header.applicationId.trim() === detail.applicationId,
  },
  {
    fields: ["structured.header.applicationId", "applicationId"],
    id: "expected-application-id-match",
    message: "Parsed application ID should match requested application ID.",
    severity: "error",
    test: (detail, options) =>
      detail.applicationId.trim() ===
      (options.expectedApplicationId ?? "").trim(),
    when: (_, options) => Boolean(options.expectedApplicationId),
  },
  {
    fields: ["structured.header.status"],
    id: "expected-status-match",
    message: "Detail status does not match summary row status.",
    severity: "warn",
    test: (detail, options) =>
      detail.structured.header.status.trim().toLowerCase() ===
      (options.expectedStatus ?? "").trim().toLowerCase(),
    when: (_, options) => Boolean(options.expectedStatus),
  },
  {
    fields: ["structured.siteLocation.locations"],
    id: "location-rows-present",
    message: "Expected at least one site location row.",
    severity: "error",
    test: (detail) => detail.structured.siteLocation.locations.length > 0,
  },
  {
    fields: ["structured.siteLocation.locations"],
    id: "selected-location-present",
    message: "Expected one selected site location row.",
    severity: "error",
    test: (detail) =>
      detail.structured.siteLocation.locations.some((row) => row.isSelected),
    when: (detail) => detail.structured.siteLocation.locations.length > 0,
  },
  {
    fields: ["coordinates", "structured.siteLocation.locations"],
    id: "coordinates-present-for-selected-location",
    message:
      "Expected top-level coordinates when selected location has coordinates.",
    severity: "error",
    test: (detail) => detail.coordinates !== null,
    when: (detail) => parseSelectedLocationCoords(detail) !== null,
  },
  {
    fields: ["coordinates", "structured.siteLocation.locations"],
    id: "coordinates-match-selected-location",
    message:
      "Top-level coordinates should closely match selected location coordinates.",
    severity: "warn",
    test: (detail) => {
      const selected = parseSelectedLocationCoords(detail);
      if (!(selected && detail.coordinates)) {
        return true;
      }
      return (
        Math.abs(selected.latitude - detail.coordinates.latitude) <=
          COORD_TOLERANCE_DEGREES &&
        Math.abs(selected.longitude - detail.coordinates.longitude) <=
          COORD_TOLERANCE_DEGREES
      );
    },
    when: (detail) =>
      parseSelectedLocationCoords(detail) !== null &&
      detail.coordinates !== null,
  },
  {
    fields: ["structured.trackoutE1Answer", "structured.trackoutDevices"],
    id: "trackout-device-required-when-e1-yes",
    message:
      "When trackout E1 answer is yes, at least one trackout device is expected.",
    severity: "error",
    test: (detail) =>
      anyTruthy(Object.values(detail.structured.trackoutDevices)),
    when: (detail) => detail.structured.trackoutE1Answer === true,
  },
  {
    fields: ["structured.waterMethods"],
    id: "at-least-one-water-method",
    message: "At least one water method should be selected.",
    severity: "warn",
    test: (detail) => anyTruthy(Object.values(detail.structured.waterMethods)),
  },
  {
    fields: [
      "structured.propertyOwnerDeveloper",
      "structured.isOwnerDeveloper",
    ],
    id: "property-owner-required-when-not-owner-developer",
    message:
      "When owner/developer answer is no, property owner/developer section should be present.",
    severity: "error",
    test: (detail) =>
      detail.structured.propertyOwnerDeveloper !== null &&
      isPresent(detail.structured.propertyOwnerDeveloper.name),
    when: (detail) => detail.structured.isOwnerDeveloper === false,
  },
  {
    fields: ["documentLinks"],
    id: "document-link-present",
    message: "No filestore document links were found on the detail page.",
    severity: "warn",
    test: (detail) => detail.documentLinks.length > 0,
  },
  {
    fields: ["permitDocument", "permitPdf"],
    id: "permit-pdf-parsed-when-permit-document-present",
    message:
      "Permit document link exists, but permit PDF fields were not extracted.",
    severity: "warn",
    test: (detail) =>
      detail.permitDocument === null || detail.permitPdf !== null,
  },
] as const;

export function evaluateDustApplicationDetailQA(
  detail: DustApplicationDetail,
  options: EvaluateOptions = {}
): DustApplicationDetailQAResult {
  const requiredEntries = FIELD_CATALOG.filter(
    (entry) =>
      entry.tier === "required" &&
      (entry.requiredWhen ? entry.requiredWhen(detail) : true)
  );
  const optionalEntries = FIELD_CATALOG.filter(
    (entry) => entry.tier === "optional"
  );

  const missingRequired = requiredEntries
    .filter((entry) => !isPresent(getPathValue(detail, entry.path)))
    .map((entry) => entry.path);
  const missingOptional = optionalEntries
    .filter((entry) => !isPresent(getPathValue(detail, entry.path)))
    .map((entry) => entry.path);

  const activeRules = CONDITIONAL_RULES.filter((rule) =>
    rule.when ? rule.when(detail, options) : true
  );
  const ruleFailures = activeRules
    .filter((rule) => !rule.test(detail, options))
    .map<DustApplicationDetailQAIssue>((rule) => ({
      fields: rule.fields,
      id: rule.id,
      message: rule.message,
      severity: rule.severity,
    }));

  const schemaParse = DUST_APPLICATION_DETAIL_CONTRACT_SCHEMA.safeParse(detail);
  const schemaIssues = schemaParse.success
    ? []
    : schemaParse.error.issues.map<DustApplicationDetailQAIssue>((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return {
          fields: [path],
          id: `schema:${path}`,
          message: issue.message,
          severity: "error",
        };
      });

  const requiredPresent = requiredEntries.length - missingRequired.length;
  const optionalPresent = optionalEntries.length - missingOptional.length;
  const conditionalFailed = ruleFailures.length;
  const conditionalPassed = activeRules.length - conditionalFailed;

  const hasErrorRuleFailure = ruleFailures.some(
    (failure) => failure.severity === "error"
  );
  const hasErrorSchemaIssue = schemaIssues.some(
    (failure) => failure.severity === "error"
  );

  return {
    applicationId: detail.applicationId,
    checkedAt: new Date().toISOString(),
    missingOptional,
    missingRequired,
    parserVersion: QA_PARSER_VERSION,
    passed:
      missingRequired.length === 0 &&
      !hasErrorRuleFailure &&
      !hasErrorSchemaIssue,
    ruleFailures,
    schemaIssues,
    summary: {
      conditionalRules: {
        active: activeRules.length,
        failed: conditionalFailed,
        passed: conditionalPassed,
      },
      counts: {
        attachments: detail.attachments.length,
        accessPointRows: detail.structured.siteLocation.accessPoints.length,
        detailFields: Object.keys(detail.detailFields).length,
        documentLinks: detail.documentLinks.length,
        locationRows: detail.structured.siteLocation.locations.length,
        permitPdfEmails: detail.permitPdf?.emails.length ?? 0,
      },
      optional: {
        coverage: ratio(optionalPresent, optionalEntries.length),
        missing: missingOptional.length,
        present: optionalPresent,
        total: optionalEntries.length,
      },
      required: {
        coverage: ratio(requiredPresent, requiredEntries.length),
        missing: missingRequired.length,
        present: requiredPresent,
        total: requiredEntries.length,
      },
    },
  };
}

function parseSelectedLocationCoords(
  detail: DustApplicationDetail
): { latitude: number; longitude: number } | null {
  const selected = detail.structured.siteLocation.locations.find(
    (row) => row.isSelected
  );
  if (!selected) {
    return null;
  }

  const latitude = Number.parseFloat(selected.latitude);
  const longitude = Number.parseFloat(selected.longitude);
  if (!(Number.isFinite(latitude) && Number.isFinite(longitude))) {
    return null;
  }

  return { latitude, longitude };
}

function getPathValue(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isPresent(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return false;
}

function ratio(value: number, total: number): number {
  if (total <= 0) {
    return 1;
  }
  return Number((value / total).toFixed(4));
}

function anyTruthy(values: readonly boolean[]): boolean {
  return values.some(Boolean);
}
