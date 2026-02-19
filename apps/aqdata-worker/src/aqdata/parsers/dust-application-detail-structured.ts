import { type Cheerio, type CheerioAPI, load } from "cheerio";
import type { AnyNode } from "domhandler";
import { DETAIL_STRUCTURED_IDS } from "./dust-application-detail-structured-ids";
import type {
  DustApplicationAccessPointRow,
  DustApplicationLocationRow,
  DustApplicationStructuredDetail,
} from "./dust-application-detail-structured-types";

export type {
  DustApplicationAccessPointRow,
  DustApplicationLocationRow,
  DustApplicationStructuredDetail,
} from "./dust-application-detail-structured-types";

const WHITESPACE_REGEX = /\s+/g;
const DATE_MM_DD_YYYY_REGEX = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME_OR_COMPANY_REGEX = /^[a-z0-9 .,&'()-]+$/i;
const ID_JSP_SUFFIX_REGEX = /_idJsp(\d+)$/i;
const TRAILING_COLON_REGEX = /:$/;

const IDS = DETAIL_STRUCTURED_IDS;
const LOCATION_PREFIX = "ThePage:siTable:12:locations:";
const ACCESS_POINT_PREFIX = "ThePage:siTable:12:accessPoints:";

export function parseStructuredDetail(
  html: string
): DustApplicationStructuredDetail {
  const $ = load(html);
  const locations = parseLocationRowsWithDom($);
  const accessPoints = parseAccessPointRowsWithDom($);

  const contactEmailRaw = extractTextById($, IDS.contact.email);
  const contactNameRaw = extractTextById($, IDS.contact.name);
  const primaryEmailRaw = extractTextById($, IDS.primaryContact.email);
  const primaryCompanyRaw = extractTextById($, IDS.primaryContact.companyName);

  const contactEmail = normalizeEmail(contactEmailRaw);
  const contactName =
    contactNameRaw || fallbackNameOrCompany(contactEmailRaw, !!contactEmail);
  const primaryEmail = normalizeEmail(primaryEmailRaw);
  const primaryCompanyName =
    primaryCompanyRaw || fallbackNameOrCompany(primaryEmailRaw, !!primaryEmail);

  const isOwnerDeveloper = resolveBooleanFromReadonlyRadios(
    $,
    IDS.isOwnerDeveloper.yesPrimary,
    IDS.isOwnerDeveloper.noPrimary,
    IDS.isOwnerDeveloper.yesSecondary,
    IDS.isOwnerDeveloper.noSecondary
  );

  const propertyOwnerName = extractTextById($, IDS.propertyOwnerDeveloper.name);
  const propertyOwnerDeveloper = propertyOwnerName
    ? {
        address1: extractTextById($, IDS.propertyOwnerDeveloper.address1),
        address2: extractTextById($, IDS.propertyOwnerDeveloper.address2),
        city: extractTextById($, IDS.propertyOwnerDeveloper.city),
        contactEmail: normalizeEmail(
          extractTextById($, IDS.propertyOwnerDeveloper.contactEmail)
        ),
        contactFirstName: extractTextById(
          $,
          IDS.propertyOwnerDeveloper.contactFirstName
        ),
        contactLastName: extractTextById(
          $,
          IDS.propertyOwnerDeveloper.contactLastName
        ),
        contactPhone: extractTextById(
          $,
          IDS.propertyOwnerDeveloper.contactPhone
        ),
        entityType: extractTextById($, IDS.propertyOwnerDeveloper.entityType),
        fax: extractTextById($, IDS.propertyOwnerDeveloper.fax),
        name: propertyOwnerName,
        phone: extractTextById($, IDS.propertyOwnerDeveloper.phone),
        state: extractTextById($, IDS.propertyOwnerDeveloper.state),
        zip: extractTextById($, IDS.propertyOwnerDeveloper.zip),
      }
    : null;

  const headerCompanyName = firstNonEmpty(
    extractTextById($, IDS.header.companyName),
    extractHeaderValueByLabel($, "Company Name")
  );
  const headerIssueDate = normalizeDate(
    firstNonEmpty(
      extractTextById($, IDS.header.issueDate),
      extractHeaderValueByLabel($, "Issue Date")
    )
  );
  const headerExpirationDate = normalizeDate(
    firstNonEmpty(
      extractTextById($, IDS.header.expirationDate),
      extractHeaderValueByLabel($, "Expiration Date")
    )
  );

  return {
    applicantCompany: {
      address1: extractTextById($, IDS.applicantCompany.address1),
      address2: extractTextById($, IDS.applicantCompany.address2),
      city: extractTextById($, IDS.applicantCompany.city),
      companyName: extractTextById($, IDS.applicantCompany.companyName),
      email: normalizeEmail(extractTextById($, IDS.applicantCompany.email)),
      entityType: extractTextById($, IDS.applicantCompany.entityType),
      phone: extractTextById($, IDS.applicantCompany.phone),
      state: extractTextById($, IDS.applicantCompany.state),
      zip: extractTextById($, IDS.applicantCompany.zip),
    },
    applicantOwner: {
      address1: extractTextById($, IDS.applicantOwner.address1),
      address2: extractTextById($, IDS.applicantOwner.address2),
      city: extractTextById($, IDS.applicantOwner.city),
      email: normalizeEmail(extractTextById($, IDS.applicantOwner.email)),
      firstName: extractTextById($, IDS.applicantOwner.firstName),
      lastName: extractTextById($, IDS.applicantOwner.lastName),
      phone: extractTextById($, IDS.applicantOwner.phone),
      state: extractTextById($, IDS.applicantOwner.state),
      zip: extractTextById($, IDS.applicantOwner.zip),
    },
    contact: {
      email: contactEmail,
      name: contactName,
      phone: extractTextById($, IDS.contact.phone),
    },
    header: {
      applicationId: extractTextById($, IDS.header.applicationId),
      companyName: headerCompanyName,
      createdDate: normalizeDate(extractTextById($, IDS.header.createdDate)),
      expirationDate: headerExpirationDate,
      issueDate: headerIssueDate,
      projectName: extractTextById($, IDS.header.projectName),
      status: extractTextById($, IDS.header.status),
    },
    isOwnerDeveloper,
    primaryContact: {
      companyName: primaryCompanyName,
      email: primaryEmail,
      fax: extractTextById($, IDS.primaryContact.fax),
      firstName: extractTextById($, IDS.primaryContact.firstName),
      lastName: extractTextById($, IDS.primaryContact.lastName),
      mobile: extractTextById($, IDS.primaryContact.mobile),
      onSitePhone: extractTextById($, IDS.primaryContact.onSitePhone),
      title: extractTextById($, IDS.primaryContact.title),
    },
    project: {
      description: extractTextById($, IDS.project.description),
      endDate: extractTextById($, IDS.project.endDate),
      name: extractTextById($, IDS.project.name),
      startDate: extractTextById($, IDS.project.startDate),
    },
    propertyOwnerDeveloper,
    siteLocation: {
      accessPoints,
      disturbedArea: extractDisturbedArea($),
      locations,
    },
    trackoutDevices: {
      gravelPad: isReadOnlyCheckboxCheckedById(
        $,
        IDS.trackoutDevices.gravelPad
      ),
      grizzlyRumbleGrate: isReadOnlyCheckboxCheckedById(
        $,
        IDS.trackoutDevices.grizzlyRumbleGrate
      ),
      other: isReadOnlyCheckboxCheckedById($, IDS.trackoutDevices.other),
      pavedArea: isReadOnlyCheckboxCheckedById(
        $,
        IDS.trackoutDevices.pavedArea
      ),
      wheelWash: isReadOnlyCheckboxCheckedById(
        $,
        IDS.trackoutDevices.wheelWash
      ),
    },
    trackoutE1Answer: resolveBooleanFromReadonlyRadios(
      $,
      IDS.trackoutE1.yes,
      IDS.trackoutE1.no
    ),
    waterMethods: {
      hose: isReadOnlyCheckboxCheckedById($, IDS.waterMethods.hose),
      other: isReadOnlyCheckboxCheckedById($, IDS.waterMethods.other),
      waterBuffalo: isReadOnlyCheckboxCheckedById(
        $,
        IDS.waterMethods.waterBuffalo
      ),
      waterPull: isReadOnlyCheckboxCheckedById($, IDS.waterMethods.waterPull),
      waterTruck: isReadOnlyCheckboxCheckedById($, IDS.waterMethods.waterTruck),
    },
  };
}

export function parseLocationRows(html: string): DustApplicationLocationRow[] {
  return parseLocationRowsWithDom(load(html));
}

function parseLocationRowsWithDom($: CheerioAPI): DustApplicationLocationRow[] {
  const selectedMap = parseLocationSelectedMap($);
  const valuesByRow = parseValueRowsByIndex($, LOCATION_PREFIX, [
    "excludeCheckbox__xc_c",
    "selectRadio__xc_r",
  ]);
  return materializeLocationRows(valuesByRow, selectedMap);
}

function parseAccessPointRowsWithDom(
  $: CheerioAPI
): DustApplicationAccessPointRow[] {
  const valuesByRow = parseValueRowsByIndex($, ACCESS_POINT_PREFIX, [
    "selectRadio__xc_r",
  ]);

  const result: DustApplicationAccessPointRow[] = [];
  const rowIndexes = [...valuesByRow.keys()].sort((a, b) => a - b);
  for (const rowIndex of rowIndexes) {
    const values = (valuesByRow.get(rowIndex) ?? [])
      .sort((a, b) => a.order - b.order)
      .map((item) => item.value);

    const latitude = values[0] ?? "";
    const longitude = values[1] ?? "";
    if (!(latitude || longitude)) {
      continue;
    }
    result.push({ latitude, longitude });
  }

  return result;
}

function parseLocationSelectedMap($: CheerioAPI): Map<number, boolean> {
  const selectedMap = new Map<number, boolean>();
  const locationsTable = findById($, "ThePage:siTable:12:locations");
  if (locationsTable.length === 0) {
    return selectedMap;
  }

  for (const rowElement of locationsTable.find("tr").toArray()) {
    const row = $(rowElement);
    const firstLocationCell = row
      .find("span[id]")
      .filter((_, element) => {
        const id = readId($, element);
        return id.startsWith(LOCATION_PREFIX);
      })
      .first();

    if (firstLocationCell.length === 0) {
      continue;
    }

    const firstCellNode = firstLocationCell.get(0);
    if (!firstCellNode) {
      continue;
    }

    const parsed = parseIndexedFieldId(
      readId($, firstCellNode),
      LOCATION_PREFIX
    );
    if (!parsed) {
      continue;
    }

    const hasSelectedClass = row.find("span.selected").length > 0;
    const hasSelectedRadio = row
      .find("img")
      .toArray()
      .some((img) => {
        const src = cleanText($(img).attr("src") ?? "");
        return src.toLowerCase().includes("radiors");
      });

    selectedMap.set(parsed.rowIndex, hasSelectedClass || hasSelectedRadio);
  }

  return selectedMap;
}

function parseValueRowsByIndex(
  $: CheerioAPI,
  prefix: string,
  ignoredFields: readonly string[]
): Map<number, Array<{ order: number; value: string }>> {
  const valuesByRow = new Map<
    number,
    Array<{ order: number; value: string }>
  >();

  for (const element of queryByIdPrefix($, prefix)) {
    const id = readId($, element);
    const parsed = parseIndexedFieldId(id, prefix);
    if (!parsed || ignoredFields.includes(parsed.field)) {
      continue;
    }

    const order = parseFieldOrder(parsed.field);
    const value = cleanText($(element).text());
    const current = valuesByRow.get(parsed.rowIndex) ?? [];
    current.push({ order, value });
    valuesByRow.set(parsed.rowIndex, current);
  }

  return valuesByRow;
}

function parseIndexedFieldId(
  id: string,
  prefix: string
): { field: string; rowIndex: number } | null {
  if (!id.startsWith(prefix)) {
    return null;
  }
  const rest = id.slice(prefix.length);
  const colon = rest.indexOf(":");
  if (colon === -1) {
    return null;
  }

  const rowIndex = Number.parseInt(rest.slice(0, colon), 10);
  if (!Number.isFinite(rowIndex)) {
    return null;
  }

  const field = rest.slice(colon + 1);
  if (!field) {
    return null;
  }

  return { field, rowIndex };
}

function parseFieldOrder(field: string): number {
  const suffix = field.match(ID_JSP_SUFFIX_REGEX)?.[1];
  if (!suffix) {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function materializeLocationRows(
  valuesByRow: Map<number, Array<{ order: number; value: string }>>,
  selectedMap: Map<number, boolean>
): DustApplicationLocationRow[] {
  const result: DustApplicationLocationRow[] = [];
  const rowIndexes = [...valuesByRow.keys()].sort((a, b) => a - b);

  for (const rowIndex of rowIndexes) {
    const rawValues = (valuesByRow.get(rowIndex) ?? [])
      .sort((a, b) => a.order - b.order)
      .map((item) => item.value);

    if (!(rawValues[0] || rawValues[5] || rawValues[6] || rawValues[7])) {
      continue;
    }

    result.push({
      address: rawValues[0] ?? "",
      city: rawValues[1] ?? "",
      county: rawValues[2] ?? "",
      isSelected: selectedMap.get(rowIndex) ?? false,
      latitude: rawValues[6] ?? "",
      longitude: rawValues[7] ?? "",
      parcel: rawValues[5] ?? "",
      state: rawValues[3] ?? "",
      zip: rawValues[4] ?? "",
    });
  }

  return result;
}

function extractDisturbedArea($: CheerioAPI): string {
  const byId = extractTextById($, IDS.siteLocation.disturbedAreaFallback);
  if (byId) {
    return byId;
  }

  const labelSpan = $("span")
    .filter(
      (_, el) => cleanText($(el).text()).toLowerCase() === "disturbed area :"
    )
    .first();
  if (labelSpan.length === 0) {
    return "";
  }

  const row = labelSpan.closest("tr");
  const value = cleanText(row.find("span[id]").last().text());
  return value.toLowerCase() === "disturbed area :" ? "" : value;
}

function extractHeaderValueByLabel($: CheerioAPI, label: string): string {
  const normalizedLabel = label
    .trim()
    .replace(TRAILING_COLON_REGEX, "")
    .toLowerCase();
  const row = $("tr[id^='ThePage:'][id$='__xc_']")
    .filter((_, element) => {
      const rowText = cleanText($(element).text()).toLowerCase();
      return rowText.startsWith(`${normalizedLabel}:`);
    })
    .first();
  if (row.length === 0) {
    return "";
  }

  const valueSpan = row.find("span[id]").last();
  if (valueSpan.length > 0) {
    const spanValue = cleanText(valueSpan.text());
    if (spanValue) {
      return spanValue;
    }
  }

  const rowText = cleanText(row.text());
  const labelPrefix = new RegExp(`^${escapeRegExp(normalizedLabel)}:\\s*`, "i");
  return rowText.replace(labelPrefix, "").trim();
}

function resolveBooleanFromReadonlyRadios(
  $: CheerioAPI,
  yesId: string,
  noId: string,
  yesFallbackId?: string,
  noFallbackId?: string
): boolean | null {
  if (isReadOnlyRadioSelectedById($, yesId)) {
    return true;
  }
  if (isReadOnlyRadioSelectedById($, noId)) {
    return false;
  }
  if (yesFallbackId && isReadOnlyRadioSelectedById($, yesFallbackId)) {
    return true;
  }
  if (noFallbackId && isReadOnlyRadioSelectedById($, noFallbackId)) {
    return false;
  }
  return null;
}

function isReadOnlyRadioSelectedById($: CheerioAPI, id: string): boolean {
  const src = findById($, id).find("img").first().attr("src") ?? "";
  return src.toLowerCase().includes("radiors");
}

function isReadOnlyCheckboxCheckedById($: CheerioAPI, id: string): boolean {
  const src = findById($, id).find("img").first().attr("src") ?? "";
  return src.toLowerCase().includes("checkrc");
}

function extractTextById($: CheerioAPI, id: string): string {
  const element = findById($, id);
  if (element.length === 0) {
    return "";
  }

  const tagName = getTagName(element.get(0));
  if (tagName === "input") {
    return cleanText(element.attr("value") ?? "");
  }
  if (tagName === "textarea") {
    return cleanText(element.text());
  }
  if (tagName === "select") {
    const selected = element.find("option[selected]").first();
    return cleanText(selected.text());
  }

  return cleanText(element.text());
}

function getTagName(node: AnyNode | undefined): string {
  if (!node || typeof node !== "object" || !("tagName" in node)) {
    return "";
  }
  const value = (node as { tagName?: unknown }).tagName;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function findById($: CheerioAPI, id: string): Cheerio<AnyNode> {
  return $(`[id="${escapeAttributeValue(id)}"]`).first();
}

function queryByIdPrefix($: CheerioAPI, prefix: string): Cheerio<AnyNode> {
  return $(`span[id^="${escapeAttributeValue(prefix)}"]`);
}

function readId($: CheerioAPI, element: AnyNode): string {
  return $(element).attr("id") ?? "";
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (DATE_MM_DD_YYYY_REGEX.test(trimmed) || DATE_ISO_REGEX.test(trimmed)) {
    return trimmed;
  }
  return "";
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  return EMAIL_REGEX.test(trimmed) ? trimmed : "";
}

function fallbackNameOrCompany(raw: string, hasEmail: boolean): string {
  if (hasEmail) {
    return "";
  }
  return looksLikeNameOrCompany(raw) ? raw : "";
}

function looksLikeNameOrCompany(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || normalizeEmail(trimmed)) {
    return false;
  }
  return NAME_OR_COMPANY_REGEX.test(trimmed);
}

function firstNonEmpty(...values: string[]): string {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttributeValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function cleanText(value: string): string {
  return value.replaceAll("\u00a0", " ").replace(WHITESPACE_REGEX, " ").trim();
}
