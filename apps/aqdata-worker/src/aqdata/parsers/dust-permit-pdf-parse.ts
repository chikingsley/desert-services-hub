import type {
  DustPermitPdfCoordinates,
  DustPermitPdfFields,
} from "./dust-permit-pdf-types";

const WHITESPACE_REGEX = /\s+/g;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const DATE_REGEX = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const PART_B_SECTION_START_REGEX =
  /Permit Application Form,\s*Part B:\s*Project Information/i;
const PART_B_SECTION_END_REGEX = /Project Location/i;
const PRIMARY_CONTACT_SECTION_START_REGEX = /Primary Project Contact/i;
const PRIMARY_CONTACT_SECTION_END_REGEX = /Dust Control Coordinator/i;
const APPLICANT_SECTION_START_REGEX =
  /Permit Application Form,\s*Part A:\s*Applicant Information/i;
const APPLICANT_SECTION_END_REGEX = /Applicant President\/Owner/i;
const FACILITY_DATES_BLOCK_REGEX =
  /FACILITY\s*ID:\s*ISSUE\s*DATE:\s*EXPIRATION\s*DATE:\s*([A-Z0-9-]+)\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i;
const APPLICANT_COMPANY_WRAPPED_REGEX =
  /Name of company or individual\s+([^\n:]+?)\s*\n\s*working as an individual:\s*([^\n\r]*)/i;
const APPLICANT_VALUE_LABEL_BOUNDARY_REGEX =
  /\b(?:Address 1|Address 2|City|State|Zip|Phone|E-Mail Address)\b/i;
const PERMIT_CONTACT_EMAIL_REGEX =
  /Provide an email address where we\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*can send the permit:/i;
const SITE_ADDRESS_COORDINATES_REGEX =
  /(-?\d{1,2}\.\d+)\s*\/\s*(-?\d{1,3}\.\d+)/;
const LABEL_LINE_REGEX = /^[A-Za-z0-9 ()/#.'-]{2,120}:$/;

export function normalizeDustPermitPdfText(value: string): string {
  return value
    .replaceAll("\r", "\n")
    .replaceAll("\f", "\n")
    .replaceAll("\u00a0", " ")
    .split("\n")
    .map((line) => line.replace(WHITESPACE_REGEX, " ").trim())
    .join("\n");
}

export function parseDustPermitPdfText(text: string): DustPermitPdfFields {
  const normalized = normalizeDustPermitPdfText(text);

  const headerBlock = extractFacilityDatesBlock(normalized);
  const projectSection = sliceBetween(
    normalized,
    PART_B_SECTION_START_REGEX,
    PART_B_SECTION_END_REGEX
  );
  const primaryContactSection = sliceBetween(
    normalized,
    PRIMARY_CONTACT_SECTION_START_REGEX,
    PRIMARY_CONTACT_SECTION_END_REGEX
  );
  const applicantSection = sliceBetween(
    normalized,
    APPLICANT_SECTION_START_REGEX,
    APPLICANT_SECTION_END_REGEX
  );

  const siteAddress = extractLabelValue(normalized, "Site Address 1");
  const coordinates =
    parseCoordinatesFromSiteAddress(siteAddress) ??
    parseCoordinatesFromLabels(normalized);

  const projectName = firstNonEmpty(
    extractLabelValue(projectSection, "Name of Project"),
    extractLabelValue(normalized, "Project Name")
  );

  const projectStartDate = firstNonEmpty(
    extractLabelValue(projectSection, "Estimated Project Start Date"),
    extractLabelValue(normalized, "Project Start Date")
  );

  const projectCompletionDate = extractLabelValue(
    projectSection,
    "Estimated Project Completion Date"
  );

  const permitContactEmail = extractPermitContactEmail(normalized);

  return {
    applicant: {
      address1: extractLabelValue(applicantSection, "Address 1"),
      address2: extractLabelValue(applicantSection, "Address 2"),
      city: extractLabelValue(applicantSection, "City"),
      companyName: extractApplicantCompanyName(applicantSection),
      email: extractLabelValue(applicantSection, "E-Mail Address"),
      entityType: extractLabelValue(applicantSection, "Type of Entity"),
      phone: extractLabelValue(applicantSection, "Phone"),
      state: extractLabelValue(applicantSection, "State"),
      zip: extractLabelValue(applicantSection, "Zip"),
    },
    applicationStatus: extractLabelValue(normalized, "Application Status"),
    attention: extractLabelValue(normalized, "ATTENTION"),
    blockPermit: extractLabelValue(normalized, "Block Permit"),
    coordinates,
    expirationDate: firstNonEmpty(
      headerBlock.expirationDate,
      extractLabelValue(normalized, "EXPIRATION DATE")
    ),
    facilityId: firstNonEmpty(
      headerBlock.facilityId,
      extractLabelValue(normalized, "FACILITY ID")
    ),
    issueDate: firstNonEmpty(
      headerBlock.issueDate,
      extractLabelValue(normalized, "ISSUE DATE")
    ),
    parcel: extractLabelValue(normalized, "Parcel #"),
    permitContactEmail,
    permitContactName: extractLabelValue(normalized, "Name"),
    permitContactPhone: extractLabelValue(normalized, "Phone"),
    primaryContact: {
      companyName: extractLabelValue(primaryContactSection, "Company Name"),
      email: extractLabelValue(primaryContactSection, "E-Mail Address"),
      fax: extractLabelValue(primaryContactSection, "Fax"),
      firstName: extractLabelValue(primaryContactSection, "First Name"),
      lastName: extractLabelValue(primaryContactSection, "Last Name"),
      mobile: extractLabelValue(primaryContactSection, "Mobile"),
      onSitePhone: extractLabelValue(primaryContactSection, "On-Site Phone"),
      title: extractLabelValue(primaryContactSection, "Title"),
    },
    project: {
      acreage: extractLabelValue(normalized, "Project Acreage"),
      completionDate: projectCompletionDate,
      description: extractLabelValue(
        projectSection,
        "Brief Project Description"
      ),
      name: projectName,
      startDate: projectStartDate,
      type: extractLabelValue(normalized, "Project Type"),
    },
    siteAddress,
    submittedDate: extractLabelValue(normalized, "Submitted Date"),
  };
}

export function extractDustPermitPdfEmails(text: string): string[] {
  const unique = new Set<string>();
  for (const match of text.matchAll(EMAIL_REGEX)) {
    const email = cleanText(match[0] ?? "").toLowerCase();
    if (email) {
      unique.add(email);
    }
  }
  return [...unique.values()];
}

export function extractDustPermitPdfLabelValues(
  text: string
): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split("\n");

  for (let index = 0; index < lines.length; index++) {
    const pair = parseLabelValueLine(
      lines[index] ?? "",
      lines[index + 1] ?? ""
    );
    if (!pair) {
      continue;
    }

    if (!(pair.key in out)) {
      out[pair.key] = pair.value;
    }
  }

  return out;
}

export function buildDustPermitPdfWarnings(
  fields: DustPermitPdfFields
): string[] {
  const warnings: string[] = [];
  if (!fields.facilityId) {
    warnings.push("Missing facilityId in permit PDF parse.");
  }
  if (!(fields.issueDate && DATE_REGEX.test(fields.issueDate))) {
    warnings.push("Missing or invalid issueDate in permit PDF parse.");
  }
  if (!(fields.expirationDate && DATE_REGEX.test(fields.expirationDate))) {
    warnings.push("Missing or invalid expirationDate in permit PDF parse.");
  }
  if (!fields.primaryContact.email) {
    warnings.push("Missing primaryContact.email in permit PDF parse.");
  }
  if (!fields.project.name) {
    warnings.push("Missing project.name in permit PDF parse.");
  }
  return warnings;
}

function extractFacilityDatesBlock(text: string): {
  expirationDate: string;
  facilityId: string;
  issueDate: string;
} {
  const match = text.match(FACILITY_DATES_BLOCK_REGEX);

  if (!match) {
    return {
      expirationDate: "",
      facilityId: "",
      issueDate: "",
    };
  }

  return {
    expirationDate: cleanText(match[3] ?? ""),
    facilityId: cleanText(match[1] ?? ""),
    issueDate: cleanText(match[2] ?? ""),
  };
}

function extractApplicantCompanyName(section: string): string {
  const wrapped = section.match(APPLICANT_COMPANY_WRAPPED_REGEX);

  if (wrapped) {
    const first = cleanText(wrapped[1] ?? "");
    const secondRaw = cleanText(wrapped[2] ?? "");
    if (secondRaw) {
      return sanitizeApplicantCompanyName(cleanText(`${first} ${secondRaw}`));
    }

    const after = section.slice((wrapped.index ?? 0) + wrapped[0].length);
    const continuation = nextNonEmptyLine(after);
    if (continuation) {
      return sanitizeApplicantCompanyName(
        cleanText(`${first} ${continuation}`)
      );
    }

    return sanitizeApplicantCompanyName(first);
  }

  return sanitizeApplicantCompanyName(
    extractLabelValue(
      section,
      "Name of company or individual working as an individual"
    )
  );
}

function extractPermitContactEmail(text: string): string {
  const contextual = text.match(PERMIT_CONTACT_EMAIL_REGEX);
  if (contextual?.[1]) {
    return cleanText(contextual[1]);
  }

  const emails = extractDustPermitPdfEmails(text);
  return emails[0] ?? "";
}

function parseCoordinatesFromSiteAddress(
  value: string
): DustPermitPdfCoordinates | null {
  const match = value.match(SITE_ADDRESS_COORDINATES_REGEX);
  if (!(match?.[1] && match[2])) {
    return null;
  }
  return buildCoordinates(match[1], match[2]);
}

function parseCoordinatesFromLabels(
  text: string
): DustPermitPdfCoordinates | null {
  const latitude = extractLabelValue(text, "Latitude");
  const longitude = extractLabelValue(text, "Longitude");
  if (!(latitude && longitude)) {
    return null;
  }
  return buildCoordinates(latitude, longitude);
}

function buildCoordinates(
  latitudeRaw: string,
  longitudeRaw: string
): DustPermitPdfCoordinates | null {
  const latitude = Number.parseFloat(latitudeRaw);
  const longitude = Number.parseFloat(longitudeRaw);
  if (
    !(Number.isFinite(latitude) && Number.isFinite(longitude)) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function extractLabelValue(text: string, label: string): string {
  if (!text) {
    return "";
  }

  const lineStartPattern = new RegExp(
    `(?:^|\\n)\\s*${escapeRegExp(label)}\\s*:?\\s*([^\\n\\r]*)`,
    "i"
  );
  const match = lineStartPattern.exec(text);
  if (match) {
    const inline = cleanText(match[1] ?? "");
    if (inline) {
      return inline;
    }

    const remainder = text.slice(match.index + match[0].length);
    const nextLineValue = nextNonEmptyLine(remainder);
    if (nextLineValue) {
      return nextLineValue;
    }
  }

  const inlineAnywherePattern = new RegExp(
    `${escapeRegExp(label)}\\s*:?\\s*([^\\n\\r]*)`,
    "i"
  );
  const inlineAnywhereMatch = inlineAnywherePattern.exec(text);
  if (!inlineAnywhereMatch) {
    return "";
  }

  const inlineAnywhereValue = cleanText(inlineAnywhereMatch[1] ?? "");
  if (inlineAnywhereValue) {
    return inlineAnywhereValue;
  }

  const remainder = text.slice(
    inlineAnywhereMatch.index + inlineAnywhereMatch[0].length
  );
  return nextNonEmptyLine(remainder);
}

function nextNonEmptyLine(text: string): string {
  const lines = text.split("\n");
  for (const raw of lines) {
    const line = cleanText(raw);
    if (!line) {
      continue;
    }
    if (looksLikeLabelLine(line)) {
      return "";
    }
    return line;
  }
  return "";
}

function looksLikeLabelLine(value: string): boolean {
  return LABEL_LINE_REGEX.test(value);
}

function parseLabelValueLine(
  lineInput: string,
  nextLineInput: string
): { key: string; value: string } | null {
  const line = cleanText(lineInput);
  if (!line.includes(":")) {
    return null;
  }

  const colon = line.indexOf(":");
  if (colon <= 0) {
    return null;
  }

  const key = cleanText(line.slice(0, colon));
  if (!key || key.length > 120) {
    return null;
  }

  let value = cleanText(line.slice(colon + 1));
  if (!value) {
    value = readContinuationValue(nextLineInput);
  }

  if (!value) {
    return null;
  }

  return { key, value };
}

function readContinuationValue(lineInput: string): string {
  const nextLine = cleanText(lineInput);
  if (!nextLine) {
    return "";
  }
  if (looksLikeLabelLine(nextLine) || nextLine.includes(":")) {
    return "";
  }
  return nextLine;
}

function sliceBetween(text: string, start: RegExp, end: RegExp): string {
  const startMatch = start.exec(text);
  if (!startMatch) {
    return "";
  }

  const startIndex = startMatch.index + startMatch[0].length;
  const tail = text.slice(startIndex);
  const endMatch = end.exec(tail);
  if (!endMatch) {
    return tail;
  }

  return tail.slice(0, endMatch.index);
}

function firstNonEmpty(...values: string[]): string {
  for (const value of values) {
    const normalized = cleanText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanText(value: string): string {
  return value.replace(WHITESPACE_REGEX, " ").trim();
}

function sanitizeApplicantCompanyName(value: string): string {
  const trimmed = cleanText(value);
  if (!trimmed) {
    return "";
  }

  const boundaryMatch = APPLICANT_VALUE_LABEL_BOUNDARY_REGEX.exec(trimmed);
  if (!boundaryMatch || boundaryMatch.index <= 0) {
    return trimmed;
  }

  return cleanText(trimmed.slice(0, boundaryMatch.index));
}
