export interface BuildingConnectedSignalFields {
  subject: string | null;
  body_preview: string | null;
  from_email: string | null;
  from_domain: string | null;
  original_sender_email: string | null;
  original_sender_domain: string | null;
  real_sender_email: string | null;
  real_sender_domain: string | null;
  platform_name: string | null;
}

function normalizeValues(values: (string | null)[]): string[] {
  return values
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
}

export function hasBuildingConnectedSignal(
  row: BuildingConnectedSignalFields
): boolean {
  const domains = normalizeValues([
    row.from_domain,
    row.original_sender_domain,
    row.real_sender_domain,
  ]);
  if (domains.includes("buildingconnected.com")) {
    return true;
  }

  const senderEmails = normalizeValues([
    row.from_email,
    row.original_sender_email,
    row.real_sender_email,
  ]);
  if (senderEmails.some((value) => value.endsWith("@buildingconnected.com"))) {
    return true;
  }

  if ((row.platform_name ?? "").trim().toLowerCase() === "buildingconnected") {
    return true;
  }

  const subject = (row.subject ?? "").toLowerCase();
  if (subject.includes("buildingconnected")) {
    return true;
  }

  const preview = (row.body_preview ?? "").toLowerCase();
  return (
    preview.includes("buildingconnected.com") ||
    preview.includes("team@buildingconnected")
  );
}
