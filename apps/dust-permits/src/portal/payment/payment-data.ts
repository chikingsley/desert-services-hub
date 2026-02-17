/**
 * Payment Data Builder
 *
 * Loads credit card and billing info from environment variables.
 * Never hardcode payment credentials in source code.
 */

import type { PaymentData } from "@/portal/types";

const REQUIRED_CARD_VARS = [
  "PAYMENT_CARD_NUMBER",
  "PAYMENT_CARD_EXPIRY_MONTH",
  "PAYMENT_CARD_EXPIRY_YEAR",
  "PAYMENT_CARD_CVV",
] as const;

const REQUIRED_BILLING_VARS = [
  "PAYMENT_BILLING_FIRST_NAME",
  "PAYMENT_BILLING_LAST_NAME",
  "PAYMENT_BILLING_ADDRESS1",
  "PAYMENT_BILLING_CITY",
  "PAYMENT_BILLING_STATE",
  "PAYMENT_BILLING_ZIP",
  "PAYMENT_BILLING_EMAIL",
  "PAYMENT_BILLING_PHONE",
] as const;

/** Read a required env var. Only call after validatePaymentEnv() confirms it exists. */
const env = (key: string): string => process.env[key] ?? "";

/**
 * Validate that required payment environment variables are set.
 */
export function validatePaymentEnv(): {
  valid: boolean;
  missing: string[];
} {
  const allRequired = [...REQUIRED_CARD_VARS, ...REQUIRED_BILLING_VARS];
  const missing = allRequired.filter((key) => !process.env[key]);
  return { valid: missing.length === 0, missing };
}

/**
 * Build PaymentData from environment variables.
 *
 * Required env vars:
 * - PAYMENT_CARD_NAME (optional, defaults to "Desert Services LLC")
 * - PAYMENT_CARD_NUMBER
 * - PAYMENT_CARD_EXPIRY_MONTH (01-12)
 * - PAYMENT_CARD_EXPIRY_YEAR (e.g. 2026)
 * - PAYMENT_CARD_CVV
 * - PAYMENT_BILLING_FIRST_NAME
 * - PAYMENT_BILLING_LAST_NAME
 * - PAYMENT_BILLING_ADDRESS1
 * - PAYMENT_BILLING_ADDRESS2 (optional)
 * - PAYMENT_BILLING_CITY
 * - PAYMENT_BILLING_STATE
 * - PAYMENT_BILLING_ZIP
 * - PAYMENT_BILLING_EMAIL
 * - PAYMENT_BILLING_PHONE
 * - PAYMENT_BILLING_COUNTRY (optional, defaults to "United States")
 *
 * @throws Error if required vars are missing
 */
export function buildPaymentData(): PaymentData {
  const { valid, missing } = validatePaymentEnv();
  if (!valid) {
    throw new Error(`Missing required payment env vars: ${missing.join(", ")}`);
  }

  return {
    card: {
      nameOnCard: env("PAYMENT_CARD_NAME") || "Desert Services LLC",
      cardNumber: env("PAYMENT_CARD_NUMBER"),
      expiryMonth: env("PAYMENT_CARD_EXPIRY_MONTH"),
      expiryYear: env("PAYMENT_CARD_EXPIRY_YEAR"),
      cvv: env("PAYMENT_CARD_CVV"),
    },
    billing: {
      firstName: env("PAYMENT_BILLING_FIRST_NAME"),
      lastName: env("PAYMENT_BILLING_LAST_NAME"),
      addressLine1: env("PAYMENT_BILLING_ADDRESS1"),
      addressLine2: env("PAYMENT_BILLING_ADDRESS2") || undefined,
      city: env("PAYMENT_BILLING_CITY"),
      state: env("PAYMENT_BILLING_STATE"),
      postalCode: env("PAYMENT_BILLING_ZIP"),
      country: env("PAYMENT_BILLING_COUNTRY") || "United States",
      email: env("PAYMENT_BILLING_EMAIL"),
      phone: env("PAYMENT_BILLING_PHONE"),
    },
  };
}
