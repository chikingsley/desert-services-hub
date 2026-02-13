/**
 * Sign Order Builder
 *
 * Generates text-only sign-order blocks for the Sandstorm template.
 */

export {
  SIGN_ORDER_TYPES,
  type SignOrderType,
} from "@lib/db/repositories/sign-order";

import {
  SIGN_ORDER_TYPES,
  type SignOrderType,
} from "@lib/db/repositories/sign-order";

const SIGN_TYPE_LABELS: Record<SignOrderType, string> = {
  "swppp-sign": "SWPPP",
  "swppp-sticker": "SWPPP sticker",
  "dust-maricopa": "Maricopa dust",
  "dust-pinal": "Pinal dust",
  "fire-access": "Fire department access",
  "fire-lane": "Fire lane",
  custom: "Custom",
};

export interface SignOrderDetailsInput {
  signType: SignOrderType;
  projectName: string;
  quantity?: number;
  companyName?: string | null;
  address?: string | null;
  permitId?: string | null;
  facilityId?: string | null;
  noiAzc?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  customBlock?: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function required(value: string | null, field: string): string {
  if (value) {
    return value;
  }
  throw new Error(`Missing required field: ${field}`);
}

function quantityOrThrow(quantity: number | undefined): number {
  const value = quantity ?? 1;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Quantity must be a positive integer");
  }
  return value;
}

function contactLineOrThrow(
  contactName: string | null,
  contactPhone: string | null
): string {
  return `${required(contactName, "contactName")}: ${required(contactPhone, "contactPhone")}`;
}

export function signTypeLabel(signType: SignOrderType): string {
  return SIGN_TYPE_LABELS[signType];
}

export function isSignOrderType(value: string): value is SignOrderType {
  return (SIGN_ORDER_TYPES as readonly string[]).includes(value);
}

export function buildSignOrderDetails(input: SignOrderDetailsInput): string {
  const projectName = required(clean(input.projectName), "projectName");
  const companyName = clean(input.companyName);
  const address = clean(input.address);
  const permitId = clean(input.permitId);
  const facilityId = clean(input.facilityId);
  const noiAzc = clean(input.noiAzc);
  const contactName = clean(input.contactName);
  const contactPhone = clean(input.contactPhone);
  const customBlock = clean(input.customBlock);
  const quantity = quantityOrThrow(input.quantity);

  switch (input.signType) {
    case "swppp-sign":
      return [
        "[SWPPP SIGN INFORMATION]",
        projectName,
        companyName ?? "Company: TBD",
        `AZC # ${required(noiAzc, "noiAzc")}`,
        `Quantity: ${quantity}`,
      ].join("\n");

    case "swppp-sticker":
      return [
        "[SWPPP STICKER INFORMATION]",
        `AZC # ${required(noiAzc, "noiAzc")}`,
        `Quantity: ${quantity}`,
      ].join("\n");

    case "dust-maricopa": {
      const facilityOrPermit = facilityId ?? permitId;
      return [
        "[DUST SIGN INFORMATION MARICOPA]",
        projectName,
        companyName ?? "Company: TBD",
        `Facility ID: ${required(facilityOrPermit, "facilityId or permitId")}`,
        "Responsible Project Individual:",
        contactLineOrThrow(contactName, contactPhone),
        address ?? "Address: TBD",
        `Quantity: ${quantity}`,
      ].join("\n");
    }

    case "dust-pinal":
      return [
        "[DUST SIGN INFORMATION PINAL]",
        "DUST CONTROL",
        projectName,
        companyName ?? "Company: TBD",
        `PERMIT # ${required(permitId, "permitId")}`,
        required(address, "address"),
        contactLineOrThrow(contactName, contactPhone),
        `Quantity: ${quantity}`,
      ].join("\n");

    case "fire-access": {
      const header = companyName
        ? `${companyName}/${projectName}`
        : projectName;
      return [
        "[FIRE DEPARTMENT ACCESS SIGN]",
        header,
        required(address, "address"),
        contactLineOrThrow(contactName, contactPhone),
        `Quantity: ${quantity}`,
      ].join("\n");
    }

    case "fire-lane":
      return [
        "[FIRE LANE SIGN]",
        "NO PARKING FIRE LANE",
        required(address, "address"),
        contactLineOrThrow(contactName, contactPhone),
        `Quantity: ${quantity}`,
      ].join("\n");

    case "custom":
      return [
        "[CUSTOM SIGN]",
        required(customBlock, "customBlock"),
        `Quantity: ${quantity}`,
      ].join("\n");

    default:
      throw new Error(`Unsupported sign type: ${input.signType}`);
  }
}

export function formatSignOrderDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}.${day}.${year}`;
}

export function buildSignOrderSubject(input: {
  signType: SignOrderType;
  projectName: string;
  date?: Date;
}): string {
  const projectName = required(clean(input.projectName), "projectName");
  const dateLabel = formatSignOrderDate(input.date);
  return `${dateLabel} ${signTypeLabel(input.signType)} sign order - ${projectName}`;
}
