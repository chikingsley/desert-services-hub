import type { NoiExtraction, Outfall } from "@pdf-analysis/types";

const LTF_RE = /LTF#:\s*(\d+)/;
const PERMIT_ID_RE = /ID#:\s*(AZC\d+)/;
const NAME_RE = /Name:\s*(.+)/;
const ADDR1_RE = /Address Line 1:\s*(.+)/;
const ADDR2_RE = /Address Line 2:\s*(.+)/;
const CITY_RE = /City:\s*(.+)/;
const STATE_RE = /State:\s*([A-Z]{2})/;
const ZIP_RE = /Zip:\s*(\d{5})/;
const SITE_NAME_RE = /Site Name:\s*(.+)/;
const LAT_LONG_RE = /Lat:\s*([\d.-]+)\s*\/\s*Long:\s*([\d.-]+)/;
const ACRES_RE = /Acres Disturbed:\s*([\d.]+)/;
const FIRST_NAME_RE = /First Name:\s*(.+)/;
const LAST_NAME_RE = /Last Name:\s*(.+)/;
const PHONE_RE = /Phone:\s*(.+)/;
const EMAIL_RE = /Work Email:\s*(.+)/;
const OUTFALL_RE = /^([A-Z][\w\s/]+?)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)/gm;
const DIGITS_ONLY_RE = /^\d+$/;

interface NoiSections {
  coverage: string;
  siteInfo: string;
  swppp: string;
}

function strip(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatPhone(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const digits = value.replaceAll(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value.trim();
}

function isJustNumber(value: string): boolean {
  return DIGITS_ONLY_RE.test(value.trim());
}

function firstMatch(regex: RegExp, text: string): string | null {
  const matched = text.match(regex);
  return strip(matched?.[1]);
}

function parseSections(fullText: string): NoiSections {
  const coverageStart = fullText.indexOf("Coverage Issued to:");
  const siteInfoStart = fullText.indexOf("Construction Site Information:");
  const swpppStart = fullText.indexOf("SWPPP Contact Information:");

  const coverage =
    coverageStart >= 0
      ? fullText.slice(
          coverageStart,
          siteInfoStart > coverageStart ? siteInfoStart : fullText.length
        )
      : "";

  const siteInfo =
    siteInfoStart >= 0
      ? fullText.slice(
          siteInfoStart,
          swpppStart > siteInfoStart ? swpppStart : fullText.length
        )
      : "";

  let swppp = "";
  if (swpppStart >= 0) {
    const pleaseNote = fullText.indexOf("Please note,", swpppStart);
    swppp = fullText.slice(
      swpppStart,
      pleaseNote > swpppStart ? pleaseNote : fullText.length
    );
  }

  return { coverage, siteInfo, swppp };
}

function extractOutfalls(text: string): Outfall[] {
  const outfalls: Outfall[] = [];
  for (const match of text.matchAll(OUTFALL_RE)) {
    const name = match[1]?.trim();
    const lat = Number.parseFloat(match[2] || "");
    const lng = Number.parseFloat(match[3] || "");
    if (!(name && Number.isFinite(lat) && Number.isFinite(lng))) {
      continue;
    }
    outfalls.push({ name, latitude: lat, longitude: lng });
  }
  return outfalls;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: deterministic, label-based extraction flow
export function extractNoi(rawText: string): NoiExtraction {
  const fullText = rawText.replaceAll(/\*\*/g, "").replaceAll(/^\*\s/gm, "");

  if (fullText.trim().length < 50) {
    throw new Error(
      `Text too short for NOI extraction (${fullText.trim().length} chars)`
    );
  }

  const warnings: string[] = [];
  const sections = parseSections(fullText);

  const ltfNumber = firstMatch(LTF_RE, fullText);
  const permitId = firstMatch(PERMIT_ID_RE, fullText);

  const applicantName = firstMatch(NAME_RE, sections.coverage);
  let applicantAddress1 = firstMatch(ADDR1_RE, sections.coverage);
  let applicantAddress2 = firstMatch(ADDR2_RE, sections.coverage);
  const applicantCity = firstMatch(CITY_RE, sections.coverage);
  const applicantState = firstMatch(STATE_RE, sections.coverage);
  const applicantZip =
    firstMatch(ZIP_RE, sections.coverage) ?? firstMatch(ZIP_RE, fullText);

  if (
    applicantAddress1 &&
    isJustNumber(applicantAddress1) &&
    applicantAddress2
  ) {
    warnings.push(
      `Applicant address line 1 contained only street number '${applicantAddress1}', combined with line 2`
    );
    applicantAddress1 = applicantAddress2;
    applicantAddress2 = null;
  }

  const siteName = firstMatch(SITE_NAME_RE, sections.siteInfo);
  const acresDisturbedRaw = firstMatch(ACRES_RE, sections.siteInfo);
  const acresDisturbed = acresDisturbedRaw
    ? Number.parseFloat(acresDisturbedRaw)
    : null;

  let latitude: number | null = null;
  let longitude: number | null = null;
  const latLong = sections.siteInfo.match(LAT_LONG_RE);
  if (latLong?.[1] && latLong?.[2]) {
    const lat = Number.parseFloat(latLong[1]);
    const lng = Number.parseFloat(latLong[2]);
    latitude = Number.isFinite(lat) ? lat : null;
    longitude = Number.isFinite(lng) ? lng : null;
  }

  const outfalls = extractOutfalls(sections.siteInfo);
  if ((latitude === null || longitude === null) && outfalls.length > 0) {
    latitude = outfalls[0]?.latitude ?? null;
    longitude = outfalls[0]?.longitude ?? null;
    warnings.push(
      "Site coordinates derived from first outfall (older NOI format)"
    );
  }

  let siteAddress: string | null = null;
  const siteAddr1 = firstMatch(ADDR1_RE, sections.siteInfo);
  if (siteAddr1) {
    const siteCity = firstMatch(CITY_RE, sections.siteInfo);
    const siteState = firstMatch(STATE_RE, sections.siteInfo) ?? "AZ";
    const siteZip = firstMatch(ZIP_RE, sections.siteInfo);
    const parts = [
      siteAddr1,
      siteCity,
      siteZip ? `${siteState} ${siteZip}` : null,
    ].filter(Boolean);
    siteAddress = parts.length > 0 ? parts.join(", ") : null;
  }

  const swpppContactFirstName = firstMatch(FIRST_NAME_RE, sections.swppp);
  const swpppContactLastName = firstMatch(LAST_NAME_RE, sections.swppp);
  const swpppContactPhone = formatPhone(firstMatch(PHONE_RE, sections.swppp));
  const swpppContactEmail = firstMatch(EMAIL_RE, sections.swppp);

  const checks: Record<string, unknown> = {
    applicantName,
    applicantAddress1,
    applicantCity,
    applicantState,
    applicantZip,
    siteName,
    siteAddress,
    latitude,
    longitude,
    acresDisturbed,
    swpppContactFirstName,
    swpppContactLastName,
    swpppContactEmail,
    swpppContactPhone,
    ltfNumber,
  };
  const missingFields = Object.entries(checks)
    .filter(([, value]) => value === null)
    .map(([key]) => key);

  const confidence =
    applicantName && siteName && swpppContactEmail ? "high" : "medium";

  return {
    applicantName: applicantName ?? "UNKNOWN",
    applicantAddress1,
    applicantAddress2,
    applicantCity,
    applicantState,
    applicantZip,
    siteName: siteName ?? "UNKNOWN",
    siteAddress,
    latitude,
    longitude,
    acresDisturbed,
    outfalls,
    swpppContactFirstName,
    swpppContactLastName,
    swpppContactEmail,
    swpppContactPhone,
    permitId,
    ltfNumber,
    _extraction: {
      source: "noi",
      confidence,
      missingFields,
      warnings,
    },
  };
}
