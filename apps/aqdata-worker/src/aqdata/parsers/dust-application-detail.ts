import { type Cheerio, type CheerioAPI, load } from "cheerio";
import type { AnyNode } from "domhandler";
import { BASE_URL } from "../constants";
import {
  type DustApplicationStructuredDetail,
  parseLocationRows,
  parseStructuredDetail,
} from "./dust-application-detail-structured";
import type { DustPermitPdfExtraction } from "./dust-permit-pdf-types";

export interface DustApplicationAttachment {
  attachmentId: string;
  attachmentType: string;
  description: string;
  status: string;
  uploadDate: string;
  url: string;
}

export interface DustApplicationDetail {
  applicationId: string;
  attachments: DustApplicationAttachment[];
  coordinates: { latitude: number; longitude: number } | null;
  detailFields: Record<string, string>;
  documentLinks: string[];
  permitDocument: DustApplicationAttachment | null;
  permitPdf: DustPermitPdfExtraction | null;
  structured: DustApplicationStructuredDetail;
}

const WHITESPACE_REGEX = /\s+/g;
const LAT_LON_REGEX =
  /(?:lat|latitude)\s*[:=]\s*(-?\d{1,3}\.\d+)[\s,;]+(?:lon|lng|longitude)\s*[:=]\s*(-?\d{1,3}\.\d+)/i;
const PERMIT_DOCUMENT_REGEX = /permit document/i;
const GENERATED_DUST_PERMIT_DESCRIPTION_REGEX =
  /generated dust permit document/i;

export function parseDustApplicationDetail(
  html: string,
  applicationId: string
): DustApplicationDetail {
  const $ = load(html);
  const detailFields = parseDetailFieldsFromDom($);
  const structured = parseStructuredDetail(html);
  const attachments = parseAttachments($);
  const permitDocument = pickPermitDocumentAttachment(attachments);
  const documentLinks =
    attachments.length > 0
      ? attachments.map((attachment) => attachment.url)
      : $("a[href*='/filestore/']")
          .map((_, element) => toAbsoluteUrl($(element).attr("href") ?? ""))
          .get()
          .filter(Boolean);

  return {
    applicationId,
    attachments,
    coordinates: extractCoordinates(html),
    detailFields,
    documentLinks,
    permitDocument,
    permitPdf: null,
    structured,
  };
}

function parseAttachments($: CheerioAPI): DustApplicationAttachment[] {
  const attachments: DustApplicationAttachment[] = [];

  $("#ThePage\\:DocTab table.x2d tr").each((_, rowElement) => {
    const row = $(rowElement);
    const cells = row.find("td");
    if (cells.length < 5) {
      return;
    }

    const link = row.find("a[href*='/filestore/']").first();
    const href = link.attr("href") ?? "";
    const url = toAbsoluteUrl(href);
    if (!url) {
      return;
    }

    const statusCell = cells.eq(0);
    const status =
      cleanText(statusCell.text()) ||
      cleanText(statusCell.find("img").first().attr("alt") ?? "") ||
      cleanText(statusCell.find("img").first().attr("title") ?? "");

    attachments.push({
      attachmentId: cleanText(cells.eq(1).text()),
      attachmentType: cleanText(link.text()) || cleanText(cells.eq(2).text()),
      description: cleanText(cells.eq(3).text()),
      status,
      uploadDate: cleanText(cells.eq(4).text()),
      url,
    });
  });

  return attachments;
}

function pickPermitDocumentAttachment(
  attachments: readonly DustApplicationAttachment[]
): DustApplicationAttachment | null {
  const generatedPermit = attachments.find(
    (attachment) =>
      PERMIT_DOCUMENT_REGEX.test(attachment.attachmentType) &&
      GENERATED_DUST_PERMIT_DESCRIPTION_REGEX.test(attachment.description)
  );
  if (generatedPermit) {
    return generatedPermit;
  }

  const permitTypeOnly = attachments.find((attachment) =>
    PERMIT_DOCUMENT_REGEX.test(attachment.attachmentType)
  );
  if (permitTypeOnly) {
    return permitTypeOnly;
  }

  const firstPdf = attachments.find((attachment) =>
    attachment.url.toLowerCase().endsWith(".pdf")
  );
  return firstPdf ?? null;
}

function toAbsoluteUrl(url: string): string {
  const trimmed = cleanText(url);
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${BASE_URL}${trimmed}`;
  }
  return `${BASE_URL}/${trimmed}`;
}

function parseDetailFieldsFromDom($: CheerioAPI): Record<string, string> {
  const detailFields: Record<string, string> = {};

  $("tr").each((_, rowElement) => {
    const row = $(rowElement);
    const labelElement = row.find("label").first();
    if (labelElement.length === 0) {
      return;
    }

    const label = cleanText(labelElement.text());
    if (!label) {
      return;
    }

    const targetId = labelElement.attr("for");
    const value = extractValueForRow($, row, targetId, label);
    if (!isUsefulValue(label, value)) {
      return;
    }

    detailFields[label] = value;
  });

  return detailFields;
}

function extractValueForRow(
  $: CheerioAPI,
  row: Cheerio<AnyNode>,
  targetId: string | undefined,
  label: string
): string {
  const controlValue = extractControlValue($, row, targetId);
  if (controlValue) {
    if (isLikelyPlaceholder(controlValue, label)) {
      return "";
    }
    return controlValue;
  }

  const cells = row
    .find("td")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);

  return (
    cells.find((item) => !isLikelyPlaceholder(item, label)) ??
    cells.find((item) => item !== label) ??
    ""
  );
}

function extractControlValue(
  $: CheerioAPI,
  row: Cheerio<AnyNode>,
  targetId?: string
): string {
  if (targetId) {
    const valueById = extractControlValueById($, targetId);
    if (valueById) {
      return valueById;
    }
  }

  const inputValue = row.find("input[value]").first().attr("value");
  if (inputValue) {
    return cleanText(inputValue);
  }

  const selectedOption = row.find("option[selected]").first().text();
  if (selectedOption) {
    return cleanText(selectedOption);
  }

  const textareaValue = row.find("textarea").first().text();
  if (textareaValue) {
    return cleanText(textareaValue);
  }

  return "";
}

function extractControlValueById($: CheerioAPI, id: string): string {
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
    return cleanText(element.find("option[selected]").first().text());
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

function isUsefulValue(label: string, value: string): boolean {
  if (!value) {
    return false;
  }

  const lowered = value.toLowerCase();
  if (lowered.includes("please select at least one primary")) {
    return false;
  }
  if (value.length > 500 && lowered.includes(label.toLowerCase())) {
    return false;
  }
  if (
    lowered.includes("important : please note") ||
    lowered.includes("provide contact information for") ||
    lowered.includes("bulk material includes, but is not limited to") ||
    lowered.includes("the applicant will be the responsible party") ||
    lowered.includes("please provide information about the legal entity")
  ) {
    return false;
  }
  if (
    value.length > label.length + 30 &&
    lowered.includes(label.toLowerCase()) &&
    (lowered.includes("please") || lowered.includes("provide"))
  ) {
    return false;
  }
  if (isLikelyPlaceholder(value, label)) {
    return false;
  }

  return true;
}

function isLikelyPlaceholder(value: string, label: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedLabel = label.trim().toLowerCase();
  if (!normalizedValue) {
    return true;
  }
  if (normalizedValue === normalizedLabel) {
    return true;
  }
  if (normalizedValue === `${normalizedLabel}:`) {
    return true;
  }
  if (normalizedValue.endsWith(":") && normalizedValue.length <= 30) {
    return true;
  }
  return false;
}

function extractCoordinates(
  html: string
): { latitude: number; longitude: number } | null {
  const rows = parseLocationRows(html);
  const prioritizedRows = [...rows].sort((first, second) => {
    if (first.isSelected === second.isSelected) {
      return 0;
    }
    return first.isSelected ? -1 : 1;
  });

  for (const row of prioritizedRows) {
    const latitude = Number.parseFloat(row.latitude);
    const longitude = Number.parseFloat(row.longitude);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return { latitude, longitude };
    }
  }

  const match = html.match(LAT_LON_REGEX);
  if (!(match?.[1] && match?.[2])) {
    return null;
  }

  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  if (!(Number.isFinite(latitude) && Number.isFinite(longitude))) {
    return null;
  }

  return { latitude, longitude };
}

function findById($: CheerioAPI, id: string): Cheerio<AnyNode> {
  return $(`[id="${escapeAttributeValue(id)}"]`).first();
}

function escapeAttributeValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function cleanText(value: string): string {
  return value.replaceAll("\u00a0", " ").replace(WHITESPACE_REGEX, " ").trim();
}
