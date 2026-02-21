import { createHash } from "node:crypto";
import { AzdeqCgpClient } from "./client";
import { ARIZONA_COUNTIES } from "./constants";
import { CgpSqliteRepository } from "./sqlite-repo";
import type {
  CgpPermitRecord,
  LtfIdSyncOptions,
  LtfIdSyncSummary,
  NormalizedPermitRecord,
  SyncOptions,
  SyncSummary,
} from "./types";

const US_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DEFAULT_LTFID_CONCURRENCY = 8;
const DEFAULT_PROGRESS_EVERY = 500;
const DEFAULT_FAILED_RETRY_DELAY_MS = 250;
const DEFAULT_RETRY_FAILED_PASSES = 2;
const MIN_LTFID_CONCURRENCY = 1;
const MAX_LTFID_CONCURRENCY = 64;

interface SyncCounters {
  fetchedRecords: number;
  insertedRecords: number;
  unchangedRecords: number;
  updatedRecords: number;
}

function parseUsDateToIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(US_DATE_RE);
  if (!match) {
    return null;
  }

  const [, month, day, year] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const yearNumber = Number(year);

  const date = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
  if (
    date.getUTCFullYear() !== yearNumber ||
    date.getUTCMonth() !== monthNumber - 1 ||
    date.getUTCDate() !== dayNumber
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function parseOptionalNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return null;
  }
  return numeric;
}

function extractCountyCode(record: CgpPermitRecord): string | null {
  return (
    record.ltfFacilityDetails?.placeAddress?.address?.countyCode ??
    record.ltfFacilityDetails?.facilityCounty?.countyCode ??
    record.companyAddress?.address?.countyCode ??
    null
  );
}

export function normalizePermitRecord(
  record: CgpPermitRecord
): NormalizedPermitRecord {
  return {
    ltfIdno: record.ltfIdno,
    permitAuthCode: record.permitAuthCode,
    permitType: record.permitType,
    permitCategoryName: record.ltfFacilityDetails?.ltfCatName ?? null,
    status: record.ltfFacilityDetails?.ltfStatus ?? null,
    countyCode: extractCountyCode(record),
    facilityName: record.facilityName,
    companyName: record.companyName,
    projectType: record.projType,
    rcoName: record.rcoName,
    swpppFirstName: record.swpppDetails?.fname ?? null,
    swpppLastName: record.swpppDetails?.lname ?? null,
    swpppEmail: record.swpppDetails?.email ?? null,
    swpppPhone: record.swpppDetails?.phone ?? null,
    submittedDateRaw: record.dateSubmitted,
    submittedDateIso: parseUsDateToIso(record.dateSubmitted),
    appliedDateRaw: record.dateApplied,
    appliedDateIso: parseUsDateToIso(record.dateApplied),
    issuedDateRaw: record.ltfFacilityDetails?.issuedDate ?? null,
    issuedDateIso: parseUsDateToIso(
      record.ltfFacilityDetails?.issuedDate ?? null
    ),
    constructionStartDateRaw: record.conStartDate,
    constructionStartDateIso: parseUsDateToIso(record.conStartDate),
    constructionEndDateRaw: record.conEndDate,
    constructionEndDateIso: parseUsDateToIso(record.conEndDate),
    permitProjectArea: parseOptionalNumber(record.permitProjectArea),
    totalProjectArea: parseOptionalNumber(record.totalProjectArea),
    facilityLatitude: parseOptionalNumber(
      record.ltfFacilityDetails?.latLongDetails?.latitude ?? null
    ),
    facilityLongitude: parseOptionalNumber(
      record.ltfFacilityDetails?.latLongDetails?.longitude ?? null
    ),
  };
}

export function hashPermitPayload(record: CgpPermitRecord): string {
  const payload = JSON.stringify(record);
  return createHash("sha256").update(payload).digest("hex");
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `cgp-sync-${timestamp}`;
}

function resolveCounties(counties?: string[]): string[] {
  if (counties && counties.length > 0) {
    return counties;
  }
  return ARIZONA_COUNTIES.map((county) => county.code);
}

function clampConcurrency(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_LTFID_CONCURRENCY;
  }

  const floored = Math.floor(value);
  if (floored < MIN_LTFID_CONCURRENCY) {
    return MIN_LTFID_CONCURRENCY;
  }
  if (floored > MAX_LTFID_CONCURRENCY) {
    return MAX_LTFID_CONCURRENCY;
  }
  return floored;
}

function assertValidLtfIdRange(startId: number, endId: number): void {
  if (!(Number.isInteger(startId) && Number.isInteger(endId))) {
    throw new Error("startId and endId must be integers.");
  }
  if (startId <= 0 || endId <= 0) {
    throw new Error("startId and endId must be positive.");
  }
  if (startId > endId) {
    throw new Error("startId must be <= endId.");
  }
}

function applyRecordsToRepository(
  records: CgpPermitRecord[],
  runId: string,
  repository: CgpSqliteRepository,
  counters: SyncCounters
): void {
  counters.fetchedRecords += records.length;

  for (const record of records) {
    const normalized = normalizePermitRecord(record);
    const payloadHash = hashPermitPayload(record);
    const changeType = repository.upsertPermit({
      runId,
      normalized,
      payloadHash,
      rawJson: JSON.stringify(record),
    });

    if (changeType === "inserted") {
      counters.insertedRecords += 1;
    } else if (changeType === "updated") {
      counters.updatedRecords += 1;
    } else {
      counters.unchangedRecords += 1;
    }
  }
}

export async function runCgpCountySync(
  options: SyncOptions
): Promise<SyncSummary> {
  const startedAt = new Date().toISOString();
  const runId = createRunId();
  const client = new AzdeqCgpClient({ endpoint: options.endpoint });
  const repository = new CgpSqliteRepository(options.dbPath);
  const counties = resolveCounties(options.counties);
  const delayMs = options.delayBetweenCountiesMs ?? 300;

  repository.init();
  repository.beginRun(runId, startedAt, counties);

  try {
    const counters: SyncCounters = {
      fetchedRecords: 0,
      insertedRecords: 0,
      updatedRecords: 0,
      unchangedRecords: 0,
    };

    for (const county of counties) {
      const records = await client.fetchByCounty(county);
      applyRecordsToRepository(records, runId, repository, counters);

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const finishedAt = new Date().toISOString();
    const softDeletedRecords = repository.markSoftDeletedMissingInRun(
      runId,
      finishedAt
    );
    repository.finishRun(runId, finishedAt, {
      fetchedRecords: counters.fetchedRecords,
      insertedRecords: counters.insertedRecords,
      updatedRecords: counters.updatedRecords,
      unchangedRecords: counters.unchangedRecords,
      softDeletedRecords,
    });

    return {
      runId,
      startedAt,
      finishedAt,
      counties,
      fetchedRecords: counters.fetchedRecords,
      insertedRecords: counters.insertedRecords,
      updatedRecords: counters.updatedRecords,
      unchangedRecords: counters.unchangedRecords,
      softDeletedRecords,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Unknown sync failure";
    repository.failRun(runId, finishedAt, message);
    throw error;
  }
}

export async function runCgpLtfIdRangeSync(
  options: LtfIdSyncOptions
): Promise<LtfIdSyncSummary> {
  const startId = options.startId;
  const endId = options.endId;
  assertValidLtfIdRange(startId, endId);

  const startedAt = new Date().toISOString();
  const runId = createRunId();
  const client = new AzdeqCgpClient({ endpoint: options.endpoint });
  const repository = new CgpSqliteRepository(options.dbPath);
  const concurrency = clampConcurrency(options.concurrency);
  const progressEvery = Number.isInteger(options.progressEvery)
    ? Math.max(1, options.progressEvery ?? DEFAULT_PROGRESS_EVERY)
    : DEFAULT_PROGRESS_EVERY;
  const retryFailedPasses = Number.isInteger(options.retryFailedPasses)
    ? Math.max(0, options.retryFailedPasses ?? DEFAULT_RETRY_FAILED_PASSES)
    : DEFAULT_RETRY_FAILED_PASSES;
  const failedRetryDelayMs = Number.isInteger(options.failedRetryDelayMs)
    ? Math.max(0, options.failedRetryDelayMs ?? DEFAULT_FAILED_RETRY_DELAY_MS)
    : DEFAULT_FAILED_RETRY_DELAY_MS;
  const totalLtfIds = endId - startId + 1;

  repository.init();
  repository.beginRun(runId, startedAt, [`ltfid:${startId}-${endId}`]);

  try {
    const counters: SyncCounters = {
      fetchedRecords: 0,
      insertedRecords: 0,
      updatedRecords: 0,
      unchangedRecords: 0,
    };
    const sleep = async (ms: number): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    };
    const retryQueue: number[] = [];
    let failedAttemptCount = 0;
    let requestedLtfIds = 0;
    let matchedLtfIds = 0;
    let nextId = startId;

    const processLtfId = async (ltfId: number): Promise<boolean> => {
      try {
        const records = await client.fetchByLtfId(String(ltfId));
        if (records.length > 0) {
          matchedLtfIds += 1;
        }
        applyRecordsToRepository(records, runId, repository, counters);
        return true;
      } catch {
        failedAttemptCount += 1;
        return false;
      }
    };

    const workers = Array.from({ length: concurrency }, async () => {
      while (true) {
        const ltfId = nextId;
        nextId += 1;
        if (ltfId > endId) {
          return;
        }

        requestedLtfIds += 1;
        const success = await processLtfId(ltfId);
        if (!success) {
          retryQueue.push(ltfId);
        }

        if (options.onProgress && requestedLtfIds % progressEvery === 0) {
          options.onProgress(requestedLtfIds, totalLtfIds);
        }
      }
    });

    await Promise.all(workers);

    if (options.onProgress) {
      options.onProgress(requestedLtfIds, totalLtfIds);
    }

    let pendingRetryIds = retryQueue;
    for (
      let retryPass = 1;
      retryPass <= retryFailedPasses && pendingRetryIds.length > 0;
      retryPass += 1
    ) {
      const nextRetryQueue: number[] = [];
      for (const ltfId of pendingRetryIds) {
        const success = await processLtfId(ltfId);
        if (!success) {
          nextRetryQueue.push(ltfId);
        }
        if (failedRetryDelayMs > 0) {
          await sleep(failedRetryDelayMs);
        }
      }
      pendingRetryIds = nextRetryQueue;
    }

    const failedLtfIds = Array.from(new Set(pendingRetryIds)).sort(
      (left, right) => left - right
    );

    const finishedAt = new Date().toISOString();
    const softDeletedRecords = repository.markSoftDeletedMissingInRun(
      runId,
      finishedAt
    );

    repository.finishRun(runId, finishedAt, {
      fetchedRecords: counters.fetchedRecords,
      insertedRecords: counters.insertedRecords,
      updatedRecords: counters.updatedRecords,
      unchangedRecords: counters.unchangedRecords,
      softDeletedRecords,
    });

    return {
      runId,
      startedAt,
      finishedAt,
      startId,
      endId,
      failedAttemptCount,
      failedLtfIdCount: failedLtfIds.length,
      failedLtfIds,
      requestedLtfIds,
      matchedLtfIds,
      fetchedRecords: counters.fetchedRecords,
      insertedRecords: counters.insertedRecords,
      updatedRecords: counters.updatedRecords,
      unchangedRecords: counters.unchangedRecords,
      softDeletedRecords,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Unknown sync failure";
    repository.failRun(runId, finishedAt, message);
    throw error;
  }
}
