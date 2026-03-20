import {
  dustPermitClosing,
  dustPermitGreeting,
  wrapDustPermitEmail,
} from "./dust-permit-email-template";

export interface DustPermitBillingTemplateVars {
  acceleratedFee?: string | null;
  acceleratedProcessing: string;
  accountName: string;
  address: string;
  adminFee?: string | null;
  applicationLabel?: string;
  applicationNumber: string;
  cardholderName: string;
  cardLastFour?: string;
  changesHtml?: string;
  confirmationId?: string | null;
  introText?: string;
  invoiceLabel?: string;
  invoiceDate?: string | null;
  invoiceNumber: string;
  paymentDate?: string | null;
  paymentMethod: string;
  paymentMovedFromInvoiceNumber?: string | null;
  permitCostLabel?: string;
  permitCost: string;
  permitLabel?: string;
  permitNumber?: string | null;
  projectName: string;
  recipientName: string;
  scheduleLabel?: string;
  scheduleValue: string;
  supersededApplicationNumber?: string;
  vendorName: string;
}

export type DustPermitBillingTemplateType =
  | "billing"
  | "billing-renewed"
  | "billing-revised";

interface EmailTemplate {
  body: string;
  subject: string;
}

interface BillingTemplateConfig {
  intro: string;
  permitCostLabel: string;
  scheduleLabel: string;
  showChanges: boolean;
  showSupersededApplication: boolean;
  subjectPrefix: string;
  supplementalFeeLabel?: string;
  supplementalFeeValue?: (vars: DustPermitBillingTemplateVars) => string | null | undefined;
}

interface BillingField {
  label: string;
  value: string | null | undefined;
}

function li(label: string, value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return `<li><div><b>${label}:</b> ${value}</div></li>`;
}

function separator(): string {
  return "<li><div>----</div></li>";
}

function ul(items: string): string {
  return `<ul style="margin-top:0; margin-bottom:0;">${items}</ul>`;
}

function renderFields(fields: BillingField[]): string {
  return fields.map((field) => li(field.label, field.value)).join("");
}

const BILLING_TEMPLATE_CONFIG: Record<
  DustPermitBillingTemplateType,
  BillingTemplateConfig
> = {
  billing: {
    intro:
      "A dust permit application has been submitted to Maricopa County. Please prepare for billing.",
    permitCostLabel: "Permit Cost (ADEQ)",
    scheduleLabel: "Schedule Charge",
    showChanges: false,
    showSupersededApplication: false,
    subjectPrefix: "Dust Permit Billing",
    supplementalFeeLabel: "Admin Fee",
    supplementalFeeValue: (vars) => vars.adminFee,
  },
  "billing-renewed": {
    intro:
      "A dust permit renewal has been submitted to Maricopa County. Please prepare for billing.",
    permitCostLabel: "Permit Cost",
    scheduleLabel: "Schedule Value",
    showChanges: false,
    showSupersededApplication: true,
    subjectPrefix: "Dust Permit Billing (Renewal)",
    supplementalFeeLabel: "Accelerated Fee",
    supplementalFeeValue: (vars) => vars.acceleratedFee,
  },
  "billing-revised": {
    intro:
      "A dust permit revision has been submitted to Maricopa County. Please prepare for billing.",
    permitCostLabel: "Permit Cost",
    scheduleLabel: "Schedule Value",
    showChanges: true,
    showSupersededApplication: true,
    subjectPrefix: "Dust Permit Billing (Revision)",
    supplementalFeeLabel: "Accelerated Fee",
    supplementalFeeValue: (vars) => vars.acceleratedFee,
  },
};

export function renderDustPermitBillingTemplate(
  type: DustPermitBillingTemplateType,
  vars: DustPermitBillingTemplateVars
): EmailTemplate {
  const config = BILLING_TEMPLATE_CONFIG[type];
  const detailsFields: BillingField[] = [
    { label: "Customer", value: vars.accountName },
    { label: "Project", value: vars.projectName },
    { label: "Site Address", value: vars.address },
    { label: vars.applicationLabel ?? "Application #", value: vars.applicationNumber },
    ...(config.showSupersededApplication
      ? [
          {
            label: "Superseded Application #",
            value: vars.supersededApplicationNumber ?? "N/A",
          },
        ]
      : []),
    {
      label: vars.permitLabel ?? "Permit # (Facility ID)",
      value: config.showSupersededApplication
        ? vars.permitNumber ?? "N/A"
        : vars.permitNumber,
    },
    { label: "Accelerated Processing", value: vars.acceleratedProcessing },
  ];

  const chargesFields: BillingField[] = [
    { label: "Vendor Paid", value: vars.vendorName },
    {
      label: vars.permitCostLabel ?? config.permitCostLabel,
      value: vars.permitCost,
    },
    ...(config.supplementalFeeLabel
      ? [
          {
            label: config.supplementalFeeLabel,
            value: config.supplementalFeeValue?.(vars),
          },
        ]
      : []),
    { label: vars.scheduleLabel ?? config.scheduleLabel, value: vars.scheduleValue },
    { label: "Confirmation #", value: vars.confirmationId },
    { label: vars.invoiceLabel ?? "Invoice #", value: vars.invoiceNumber },
  ];

  const paymentFields: BillingField[] = [
    { label: "Payment Method", value: vars.paymentMethod },
    { label: "Payment Date", value: vars.paymentDate },
    { label: "Card Last 4", value: vars.cardLastFour },
    { label: "Cardholder", value: vars.cardholderName },
    { label: "Invoice Date", value: vars.invoiceDate },
    {
      label: "Payment Moved From Invoice #",
      value: vars.paymentMovedFromInvoiceNumber,
    },
  ];

  const body =
    dustPermitGreeting() +
    `<div>${vars.introText ?? config.intro}</div>` +
    ul(
      renderFields(detailsFields) +
        separator() +
        renderFields(chargesFields) +
        separator() +
        renderFields(paymentFields)
    ) +
    (config.showChanges && vars.changesHtml
      ? `<div><br></div><div><b>Changes Made:</b></div><ul style="margin-top:0; margin-bottom:0;">${vars.changesHtml}</ul>`
      : "") +
    dustPermitClosing();

  return {
    subject: `${config.subjectPrefix} - ${vars.projectName}`,
    body: wrapDustPermitEmail(body),
  };
}
