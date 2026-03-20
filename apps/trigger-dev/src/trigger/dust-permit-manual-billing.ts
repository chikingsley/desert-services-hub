export interface ManualBillingPermitInput {
  accountName: string;
  acceleratedProcessing?: string | null;
  address: string;
  applicationLabel?: string | null;
  applicationNumber: string;
  introText?: string | null;
  invoiceLabel?: string | null;
  permitNumber?: string | null;
  permitCostLabel?: string | null;
  permitLabel?: string | null;
  projectName: string;
  recipientName?: string | null;
  scheduleLabel?: string | null;
  supersededApplicationNumber?: string | null;
}

export function resolveManualBillingPermitBaseVars(
  input: ManualBillingPermitInput
) {
  return {
    acceleratedProcessing: input.acceleratedProcessing?.trim() || "No",
    accountName: input.accountName.trim(),
    address: input.address.trim(),
    applicationLabel: input.applicationLabel?.trim() || undefined,
    applicationNumber: input.applicationNumber.trim(),
    introText: input.introText?.trim() || undefined,
    invoiceLabel: input.invoiceLabel?.trim() || undefined,
    permitNumber: input.permitNumber?.trim() || undefined,
    permitCostLabel: input.permitCostLabel?.trim() || undefined,
    permitLabel: input.permitLabel?.trim() || undefined,
    projectName: input.projectName.trim(),
    recipientName: input.recipientName?.trim() || "Team",
    scheduleLabel: input.scheduleLabel?.trim() || undefined,
    supersededApplicationNumber:
      input.supersededApplicationNumber?.trim() || "N/A",
  };
}
