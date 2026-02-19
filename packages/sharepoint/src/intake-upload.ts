import { existsSync } from "node:fs";

import { db } from "@lib/db/client";
import { getProjectById } from "@lib/db/repositories/project";
import { getEstimatesForProject } from "@lib/db/repositories/project-estimate";
import type { Project } from "@lib/db/types";
import { SharePointClient } from "@sharepoint/client";
import {
  buildCustomerProjectsPath,
  buildSharePointUrl,
  DEFAULT_STATUS,
  getStatusFolder,
  sanitizeName,
} from "@sharepoint/paths";

const getAccountNameById = db.query<{ name: string }>(
  "SELECT name FROM accounts WHERE id = $1"
);

const STATUS_CANDIDATES = ["Active", "Submitted", "Lost", "Finished"] as const;

const LEADING_SLASHES_RE = /^\/+/;
const TRAILING_SLASHES_RE = /\/+$/;

export function createSharePointClientFromEnv(): SharePointClient | null {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
  if (!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET)) {
    return null;
  }

  return new SharePointClient({
    azureClientId: AZURE_CLIENT_ID,
    azureClientSecret: AZURE_CLIENT_SECRET,
    azureTenantId: AZURE_TENANT_ID,
  });
}

export function parseDocumentLibraryPathFromSharePointUrl(
  sharepointUrl: string | null
): string | null {
  if (!sharepointUrl) {
    return null;
  }

  // Preferred: decode the URL path and split after "Shared Documents".
  // Example stored in DB: https://.../Shared%20Documents/Customer%20Projects/Active/...
  try {
    const url = new URL(sharepointUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    const marker = "/Shared Documents/";
    const idx = decodedPath.indexOf(marker);
    if (idx !== -1) {
      const after = decodedPath.slice(idx + marker.length);
      const cleaned = after
        .replace(LEADING_SLASHES_RE, "")
        .replace(TRAILING_SLASHES_RE, "");
      return cleaned.length > 0 ? cleaned : null;
    }
  } catch {
    // fall through
  }

  // Fallback: string search on encoded marker.
  const markerEnc = "Shared%20Documents/";
  const idxEnc = sharepointUrl.indexOf(markerEnc);
  if (idxEnc === -1) {
    return null;
  }

  const after = sharepointUrl.slice(idxEnc + markerEnc.length);
  const withoutQuery = after.split("?")[0]?.split("#")[0] ?? after;
  try {
    const decoded = decodeURIComponent(withoutQuery);
    const cleaned = decoded
      .replace(LEADING_SLASHES_RE, "")
      .replace(TRAILING_SLASHES_RE, "");
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

async function resolveAccountName(project: Project): Promise<string | null> {
  const contractor = project.contractor?.trim();
  if (contractor) {
    return contractor;
  }

  if (project.accountId) {
    const row = await getAccountNameById.get(project.accountId);
    const name = row?.name?.trim();
    if (name) {
      return name;
    }
  }

  return null;
}

export async function resolveCustomerProjectsFolderPath(
  sp: SharePointClient,
  project: Project
): Promise<string | null> {
  const accountName = await resolveAccountName(project);
  if (!accountName) {
    return null;
  }

  // Best source: estimate.sharepoint_url (already points at the correct folder).
  // Fallback: use bid_status to pick the status folder and probe for an existing folder.
  let preferredStatus = DEFAULT_STATUS;

  const linkedEstimates = await getEstimatesForProject(project.id);

  for (const linked of linkedEstimates) {
    if (linked.sharepointUrl) {
      const parsed = parseDocumentLibraryPathFromSharePointUrl(
        linked.sharepointUrl
      );
      if (parsed) {
        return parsed;
      }
    }
  }

  if (linkedEstimates[0]) {
    preferredStatus = getStatusFolder(linkedEstimates[0].bidStatus ?? null);
  }

  // Try existing folders under known status buckets before creating anything.
  // This avoids accidentally creating duplicates if the status was inferred wrong.
  const statuses: string[] = [];
  statuses.push(preferredStatus);
  for (const s of STATUS_CANDIDATES) {
    if (!statuses.includes(s)) {
      statuses.push(s);
    }
  }

  for (const status of statuses) {
    const candidate = buildCustomerProjectsPath({
      accountName,
      projectName: project.name,
      statusFolder: status,
    });

    try {
      if (await sp.exists(candidate)) {
        return candidate;
      }
    } catch {
      // Treat as non-existent and continue.
    }
  }

  return buildCustomerProjectsPath({
    accountName,
    projectName: project.name,
    statusFolder: preferredStatus,
  });
}

function splitExtension(fileName: string): { stem: string; ext: string } {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0 || idx === fileName.length - 1) {
    return { ext: "", stem: fileName };
  }
  return { ext: fileName.slice(idx), stem: fileName.slice(0, idx) };
}

function buildStableAltName(fileName: string, stableSuffix: string): string {
  const safeSuffix = sanitizeName(stableSuffix).replaceAll(/\s+/g, "-");
  const { stem, ext } = splitExtension(fileName);
  return `${stem}-intake-${safeSuffix}${ext}`;
}

export async function uploadLocalFileToProjectSubfolder(
  sp: SharePointClient,
  options: {
    projectId: number;
    subfolder: string;
    localPath: string;
    originalFileName: string;
    stableSuffix?: string;
  }
): Promise<{
  webUrl: string | null;
  sharepointPath: string;
  folderUrl: string;
} | null> {
  const project = await getProjectById(options.projectId);
  if (!project) {
    return null;
  }

  const folderPath = await resolveCustomerProjectsFolderPath(sp, project);
  if (!folderPath) {
    return null;
  }

  if (!existsSync(options.localPath)) {
    return null;
  }

  const folderWithSub = `${folderPath}/${options.subfolder}`;

  // Ensure the target folder exists.
  // Note: SharePointClient.ensureFolder relies on createFolder being idempotent.
  await sp.ensureFolder(folderWithSub);

  const desiredName = sanitizeName(options.originalFileName) || "intake-file";
  const desiredItemPath = `${folderWithSub}/${desiredName}`;

  let finalName = desiredName;

  // Never overwrite an existing file.
  // If the preferred name exists, switch to a stable alt name (based on DB id).
  if (await sp.exists(desiredItemPath)) {
    if (!options.stableSuffix) {
      return {
        folderUrl: buildSharePointUrl(folderWithSub),
        sharepointPath: desiredItemPath,
        webUrl: null,
      };
    }

    const altName = buildStableAltName(desiredName, options.stableSuffix);
    const altItemPath = `${folderWithSub}/${altName}`;

    // Idempotent: if alt already exists, treat as already uploaded.
    if (await sp.exists(altItemPath)) {
      return {
        folderUrl: buildSharePointUrl(folderWithSub),
        sharepointPath: altItemPath,
        webUrl: null,
      };
    }

    finalName = altName;
  }

  const content = Buffer.from(await Bun.file(options.localPath).arrayBuffer());
  const uploaded = await sp.upload(folderWithSub, finalName, content);

  return {
    folderUrl: buildSharePointUrl(folderWithSub),
    sharepointPath: `${folderWithSub}/${finalName}`,
    webUrl: uploaded.webUrl ?? null,
  };
}
