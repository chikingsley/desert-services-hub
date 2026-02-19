import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { AQDataClient } from "../aqdata/client";
import { FORMS } from "../aqdata/constants";
import { parseDustApplicationExport } from "../aqdata/parsers/dust-applications";
import type { DustApplication } from "../aqdata/types";
import type {
  AQPermitRecord,
  Coordinates,
  SyncResult,
} from "../services/types";
import { upsertAQDataPermits } from "./persistence";

const DEFAULT_DATA_DIR =
  process.env.AQDATA_OUTPUT_DIR || join(process.cwd(), "data", "aqdata");

interface SyncOptions {
  companyOnly: boolean;
}

interface CoordinateResponse {
  coordinates?: {
    lat?: number;
    latitude?: number;
    lng?: number;
    lon?: number;
    longitude?: number;
  };
  lat?: number;
  latitude?: number;
  lng?: number;
  lon?: number;
  longitude?: number;
}

export async function runAQSync(options: SyncOptions): Promise<SyncResult> {
  const client = new AQDataClient();
  await client.connect();
  await client.navigateToDustApplicationSearch();

  const companyName = process.env.AQDATA_COMPANY_NAME?.trim();
  const searchParams =
    options.companyOnly && companyName
      ? {
          companyName,
        }
      : {};

  await client.searchDustApplications(searchParams);
  const exportBuffer = await client.exportCurrentResults(
    FORMS.dustApplications.exportBtn
  );

  const parsed = parseDustApplicationExport(exportBuffer);
  const permits = await enrichCoordinates(parsed);
  const upsertedToDb = await upsertAQDataPermits(permits);

  const { outputPath } = buildOutputPaths({
    companyOnly: options.companyOnly,
    dataDir: DEFAULT_DATA_DIR,
  });
  const permitsFilePath = ensureParent(join(DEFAULT_DATA_DIR, "permits.jsonl"));

  await Bun.write(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        matchedCompanyName: options.companyOnly ? companyName : undefined,
        records: permits,
        totalRecords: permits.length,
      },
      null,
      2
    )}\n`
  );

  const jsonl = permits
    .map((permit) =>
      JSON.stringify({
        capturedAt: new Date().toISOString(),
        permit,
      })
    )
    .join("\n");

  if (jsonl.length > 0) {
    const existing = await Bun.file(permitsFilePath)
      .text()
      .catch(() => "");
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    await Bun.write(permitsFilePath, `${existing}${prefix}${jsonl}\n`);
  }

  const withCoordinates = permits.filter(
    (permit) => permit.coordinates !== null
  ).length;

  return {
    success: true,
    stats: {
      matchedCompanyName: options.companyOnly ? companyName : undefined,
      outputPath,
      permitsFilePath,
      totalRecords: permits.length,
      upsertedToDb,
      withCoordinates,
    },
  };
}

function ensureParent(path: string): string {
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

async function enrichCoordinates(
  records: DustApplication[]
): Promise<AQPermitRecord[]> {
  const out: AQPermitRecord[] = [];
  for (const record of records) {
    const coordinates = await fetchCoordinates(record.applicationId);
    out.push({
      ...record,
      coordinates,
    });
  }
  return out;
}

async function fetchCoordinates(
  applicationId: string
): Promise<Coordinates | null> {
  const endpointTemplate = process.env.AQDATA_COORDINATES_API_URL?.trim();
  if (!endpointTemplate) {
    return null;
  }

  const endpoint = endpointTemplate.replace(
    "{applicationId}",
    encodeURIComponent(applicationId)
  );

  try {
    const res = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return null;
    }

    const body = (await res.json()) as CoordinateResponse;
    return parseCoordinatesFromResponse(body);
  } catch {
    return null;
  }
}

interface BuildOutputPathsInput {
  companyOnly: boolean;
  dataDir: string;
}

export function buildOutputPaths(input: BuildOutputPathsInput): {
  outputPath: string;
  timestamp: string;
} {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const runType = input.companyOnly ? "company" : "full";
  const outputPath = ensureParent(
    join(input.dataDir, `aqdata-${runType}-${timestamp}.json`)
  );
  return { outputPath, timestamp };
}

export function parseCoordinatesFromResponse(
  body: CoordinateResponse
): Coordinates | null {
  const lat =
    body.coordinates?.latitude ??
    body.coordinates?.lat ??
    body.latitude ??
    body.lat;
  const lon =
    body.coordinates?.longitude ??
    body.coordinates?.lng ??
    body.coordinates?.lon ??
    body.longitude ??
    body.lng ??
    body.lon;

  if (typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }

  return {
    latitude: lat,
    longitude: lon,
  };
}
