/**
 * Point & Pay Payment Portal Selectors
 *
 * Vaadin-based payment gateway at public.pointandpay.net.
 * Used after submitting a dust permit application on Page 5.
 *
 * These selectors target stable attributes (autocomplete, name, placeholder, class)
 * rather than dynamic Vaadin IDs which change between sessions.
 *
 * Payment flow: Page 1 (Payment) → Page 2 (Submit/Review) → Page 3 (Receipt)
 */

/** Page 1: Payment - Credit card + billing info */
export const paymentPage1 = {
  /** Credit card fields */
  card: {
    nameOnCard: 'vaadin-text-field[autocomplete="cc-name"] input[slot="input"]',
    cardNumber: "#cc-number input[slot='input']",
    expiryMonth: 'vaadin-combo-box[placeholder="MM"]',
    expiryYear: 'vaadin-combo-box[placeholder="YYYY"]',
    cvv: "#cc-csc input[slot='input']",
  },

  /** Billing address fields */
  billing: {
    firstName:
      'vaadin-text-field[autocomplete="given-name"] input[slot="input"]',
    lastName:
      'vaadin-text-field[autocomplete="family-name"] input[slot="input"]',
    addressLine1:
      'vaadin-text-field[autocomplete="address-line1"] input[slot="input"]',
    addressLine2:
      'vaadin-text-field[autocomplete="address-line2"] input[slot="input"]',
    country: 'vaadin-combo-box[name="country"]',
    city: 'vaadin-text-field[autocomplete="address-level2"] input[slot="input"]',
    state: 'vaadin-combo-box[name="address-level1"]',
    postalCode:
      'vaadin-text-field[autocomplete="postal-code"] input[slot="input"]',
    email: 'vaadin-email-field[autocomplete="email"] input[slot="input"]',
    phone: 'vaadin-text-field[autocomplete="tel"] input[slot="input"]',
  },

  /** Payment type tabs */
  creditTab: 'vaadin-tab:has(span.fs-selector-label:has-text("Credit"))',
  eCheckTab: 'vaadin-tab:has(span.fs-selector-label:has-text("eCheck"))',

  /** Continue button */
  continueButton: "vaadin-button.next-button",
} as const;

/** Page 2: Submit/Review - Confirmation + pay */
export const paymentPage2 = {
  /** Terms of service checkbox */
  tosCheckbox: 'vaadin-checkbox input[type="checkbox"]',

  /** Navigation buttons */
  payNowButton: "vaadin-button.next-button",
  backButton: "vaadin-button.prev-button",

  /** Amount displays */
  subTotal: ".subtotal .monetary-amount",
  convenienceFee: "fee-summary .monetary-amount",
  total: ".total .monetary-amount.total-amount",

  /** Customer info summary */
  customerInfo: "customer-info-summary",

  /** Payment method summary (masked card) */
  cardMask: '[name="CC-NUM-MASK"]',
} as const;

/** Page 3: Receipt */
export const paymentReceipt = {
  // Selectors TBD - need HTML snapshot of receipt page
  container: "vaadin-vertical-layout",
} as const;

/** Navigation / page detection */
export const paymentNav = {
  /** Step labels in the workflow stepper */
  stepPayment: "step-label:has-text('Payment')",
  stepSubmit: "step-label:has-text('Submit')",
  stepReceipt: "step-label:has-text('Receipt')",

  /** Return to Maricopa link */
  returnToMaricopa: 'a.return-to[href*="cancelPayment"]',
} as const;

/** Combined Point & Pay selectors */
export const pointandpay = {
  page1: paymentPage1,
  page2: paymentPage2,
  receipt: paymentReceipt,
  nav: paymentNav,
} as const;
