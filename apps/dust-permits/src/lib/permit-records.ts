/**
 * Permit Record Helpers
 *
 * Keeps hub permit records in sync with automation lifecycle actions
 * (create/renew/revise drafts, close, delete).
 */

import { db } from "@lib/db/hub";
import { getPermitById, upsertPermit } from "@lib/db/repositories/dust-permit";
import type { DeepPartial, FormData } from "@/form-data";

export type DraftFlow = "new-company" | "existing-company" | "renew" | "revise";

export interface PersistDraftPermitInput {
  applicationId: string;
  flow: DraftFlow;
  sourcePermitId?: string | null;
  formData?: DeepPartial<FormData>;
  companyName?: string | null;
}

function inferCompanyName(
  formData: DeepPartial<FormData> | undefined,
  fallback: string | null
): string | null {
  const fromApplicant = formData?.applicant?.companyName?.trim();
  if (fromApplicant) {
    return fromApplicant;
  }

  const fromPrimaryContact = formData?.primaryContact?.companyName?.trim();
  if (fromPrimaryContact) {
    return fromPrimaryContact;
  }

  const fromFallback = fallback?.trim();
  return fromFallback && fromFallback.length > 0 ? fromFallback : null;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function oneYearFromTodayIsoDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export async function persistDraftPermitRecord(
  input: PersistDraftPermitInput
): Promise<void> {
  const { applicationId, sourcePermitId, formData, companyName } = input;
  const source = sourcePermitId ? await getPermitById(sourcePermitId) : null;
  const isRenewal = input.flow === "renew";
  const renewalStartDate = isRenewal ? todayIsoDate() : null;
  const renewalEndDate = isRenewal ? oneYearFromTodayIsoDate() : null;

  await upsertPermit({
    accountId: source?.accountId ?? null,
    address: source?.address ?? null,
    city: source?.city ?? null,
    companyName: inferCompanyName(
      formData,
      companyName ?? source?.companyName ?? null
    ),
    facilityId: source?.facilityId ?? null,
    id: applicationId,
    isAccelerated: source?.isAccelerated ?? false,
    isBlockPermit: source?.isBlockPermit ?? false,
    parcel: source?.parcel ?? null,
    portalCompanyId: source?.portalCompanyId ?? null,
    previousAppId: sourcePermitId ?? null,
    projectEndDate:
      renewalEndDate ??
      formData?.project?.endDate ??
      source?.projectEndDate ??
      null,
    projectId: source?.projectId ?? null,
    projectName: formData?.project?.name ?? source?.projectName ?? null,
    projectStartDate:
      renewalStartDate ??
      formData?.project?.startDate ??
      source?.projectStartDate ??
      null,
    status: "Draft",
  });
}

export async function markPermitClosedRecord(permitId: string): Promise<void> {
  await upsertPermit({
    closedDate: todayIsoDate(),
    id: permitId,
    status: "Closed",
  });
}

export async function deletePermitRecord(permitId: string): Promise<void> {
  await db.run(
    "DELETE FROM dust_permits_filed_by_desert_services WHERE id = ?",
    [permitId]
  );
}

export async function deleteAllDraftPermitRecords(): Promise<number> {
  const row = await db
    .query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM dust_permits_filed_by_desert_services WHERE status = 'Draft'"
    )
    .get();

  await db.run(
    "DELETE FROM dust_permits_filed_by_desert_services WHERE status = 'Draft'"
  );

  return Number(row?.count ?? 0);
}
