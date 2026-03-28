export type WorkflowField = "contract" | "dust_permit" | "noi" | "safety";

export type NormalizedContractStatus =
  | "done"
  | "n_a"
  | "negotiating"
  | "pending";
export type NormalizedDustStatus = "done" | "n_a" | "requested" | "submitted";
export type NormalizedSafetyStatus = "done" | "n_a" | "requested";
export type NormalizedNoiStatus = "done" | "requested";

export interface WorkflowSnapshot {
  contract: NormalizedContractStatus;
  dust_permit: NormalizedDustStatus;
  noi: NormalizedNoiStatus;
  safety: NormalizedSafetyStatus;
}

export const workflowFieldLabels: Record<WorkflowField, string> = {
  contract: "Contract",
  dust_permit: "Dust Permit",
  noi: "NOI",
  safety: "Safety",
};

export const workflowFields: readonly WorkflowField[] = [
  "contract",
  "dust_permit",
  "safety",
  "noi",
] as const;

const statusLabels = {
  contract: {
    done: "Done",
    n_a: "N/A",
    negotiating: "Negotiating",
    pending: "Pending",
  },
  dust_permit: {
    done: "Done",
    n_a: "N/A",
    requested: "Requested",
    submitted: "Submitted",
  },
  noi: {
    done: "Done",
    requested: "Requested",
  },
  safety: {
    done: "Done",
    n_a: "N/A",
    requested: "Requested",
  },
} as const;

export const normalizeContractStatus = (
  status: string | null | undefined
): NormalizedContractStatus => {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not needed" ||
    normalized === "no action"
  ) {
    return "n_a";
  }
  if (
    normalized === "done" ||
    normalized === "executed" ||
    normalized === "complete" ||
    normalized === "completed"
  ) {
    return "done";
  }
  if (
    normalized === "negotiating" ||
    normalized === "sent back" ||
    normalized === "awaiting counterparty" ||
    normalized === "triage in progress" ||
    normalized === "ready to send back"
  ) {
    return "negotiating";
  }
  return "pending";
};

export const normalizeDustStatus = (
  status: string | null | undefined
): NormalizedDustStatus => {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not needed" ||
    normalized === "no action"
  ) {
    return "n_a";
  }
  if (
    normalized === "done" ||
    normalized === "active" ||
    normalized === "issued" ||
    normalized === "complete" ||
    normalized === "completed"
  ) {
    return "done";
  }
  if (normalized === "submitted" || normalized === "filed") {
    return "submitted";
  }
  if (normalized === "requested" || normalized === "pending") {
    return "requested";
  }
  return "n_a";
};

export const normalizeSafetyStatus = (
  status: string | null | undefined
): NormalizedSafetyStatus => {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not needed" ||
    normalized === "no action"
  ) {
    return "n_a";
  }
  if (
    normalized === "done" ||
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "approved"
  ) {
    return "done";
  }
  return "requested";
};

export const normalizeNoiStatus = (
  status: string | null | undefined
): NormalizedNoiStatus => {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized === "done" ||
    normalized === "submitted" ||
    normalized === "filed" ||
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not needed"
  ) {
    return "done";
  }
  return "requested";
};

export const getWorkflowSnapshot = (params: {
  contractStatus: string | null | undefined;
  dustStatus: string | null | undefined;
  noiStatus: string | null | undefined;
  safetyStatus: string | null | undefined;
}): WorkflowSnapshot => ({
  contract: normalizeContractStatus(params.contractStatus),
  dust_permit: normalizeDustStatus(params.dustStatus),
  noi: normalizeNoiStatus(params.noiStatus),
  safety: normalizeSafetyStatus(params.safetyStatus),
});

export const needsActionByField = (
  snapshot: WorkflowSnapshot,
  field: WorkflowField
): boolean => {
  if (field === "contract") {
    return (
      snapshot.contract === "pending" || snapshot.contract === "negotiating"
    );
  }
  if (field === "dust_permit") {
    return (
      snapshot.dust_permit === "requested" ||
      snapshot.dust_permit === "submitted"
    );
  }
  if (field === "safety") {
    return snapshot.safety === "requested";
  }
  return snapshot.noi === "requested";
};

export const hasNeedsAction = (snapshot: WorkflowSnapshot): boolean =>
  workflowFields.some((field) => needsActionByField(snapshot, field));

export const getWorkflowStatusLabel = (
  field: WorkflowField,
  value: WorkflowSnapshot[WorkflowField]
): string => {
  if (field === "contract") {
    return statusLabels.contract[value as NormalizedContractStatus];
  }
  if (field === "dust_permit") {
    return statusLabels.dust_permit[value as NormalizedDustStatus];
  }
  if (field === "safety") {
    return statusLabels.safety[value as NormalizedSafetyStatus];
  }
  return statusLabels.noi[value as NormalizedNoiStatus];
};

export const getWorkflowTone = (
  field: WorkflowField,
  value: WorkflowSnapshot[WorkflowField]
): string => {
  if (field === "contract") {
    if (value === "done") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (value === "negotiating") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    if (value === "pending") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }
    return "border-border bg-muted text-muted-foreground";
  }

  if (value === "done") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (value === "requested" || value === "submitted") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-border bg-muted text-muted-foreground";
};
