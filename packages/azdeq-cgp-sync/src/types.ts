export interface CgpAddress {
  address: string | null;
  aptSuite: string | null;
  city: string | null;
  countyCode: string | null;
  state: string | null;
  zip: string | null;
}

export interface CgpPlaceAddress {
  address: CgpAddress | null;
}

export interface CgpLatLong {
  latitude: string | null;
  longitude: string | null;
}

export interface CgpFacilityDetails {
  facilityCounty: {
    countyCode: string | null;
  } | null;
  issuedDate: string | null;
  latLongDetails: CgpLatLong | null;
  ltfCatName: string | null;
  ltfStatus: string | null;
  placeAddress: CgpPlaceAddress | null;
}

export interface CgpSwpppDetails {
  email: string | null;
  ext: string | null;
  fname: string | null;
  lname: string | null;
  phone: string | null;
}

export interface CgpOutfall {
  elevation: string | null;
  latLongDetails: CgpLatLong | null;
}

export interface CgpPermitRecord {
  commonAreaInd: string | null;
  companyAddress: {
    address: CgpAddress | null;
  } | null;
  companyName: string | null;
  conEndDate: string | null;
  conStartDate: string | null;
  dateApplied: string | null;
  dateSubmitted: string | null;
  facilityName: string | null;
  ltfFacilityDetails: CgpFacilityDetails | null;
  ltfIdno: string;
  outfalls: CgpOutfall[];
  permitAuthCode: string | null;
  permitProjectArea: string | null;
  permitType: string | null;
  projType: string | null;
  rcoName: string | null;
  swpppDetails: CgpSwpppDetails | null;
  totalProjectArea: string | null;
}

export interface CgpQuery {
  companyname?: string;
  facilitycounty?: string;
  facilityname?: string;
  ltfid?: string;
}

export interface CgpClientOptions {
  endpoint?: string;
  maxRetries?: number;
  referer?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface NormalizedPermitRecord {
  appliedDateIso: string | null;
  appliedDateRaw: string | null;
  companyName: string | null;
  constructionEndDateIso: string | null;
  constructionEndDateRaw: string | null;
  constructionStartDateIso: string | null;
  constructionStartDateRaw: string | null;
  countyCode: string | null;
  facilityLatitude: number | null;
  facilityLongitude: number | null;
  facilityName: string | null;
  issuedDateIso: string | null;
  issuedDateRaw: string | null;
  ltfIdno: string;
  permitAuthCode: string | null;
  permitCategoryName: string | null;
  permitProjectArea: number | null;
  permitType: string | null;
  projectType: string | null;
  rcoName: string | null;
  status: string | null;
  submittedDateIso: string | null;
  submittedDateRaw: string | null;
  swpppEmail: string | null;
  swpppFirstName: string | null;
  swpppLastName: string | null;
  swpppPhone: string | null;
  totalProjectArea: number | null;
}

export interface SyncSummary {
  counties: string[];
  fetchedRecords: number;
  finishedAt: string;
  insertedRecords: number;
  runId: string;
  softDeletedRecords: number;
  startedAt: string;
  unchangedRecords: number;
  updatedRecords: number;
}

export interface SyncOptions {
  counties?: string[];
  dbPath: string;
  delayBetweenCountiesMs?: number;
  endpoint?: string;
}

export interface LtfIdSyncOptions {
  concurrency?: number;
  dbPath: string;
  endId: number;
  endpoint?: string;
  failedRetryDelayMs?: number;
  onProgress?: LtfIdSyncProgress;
  progressEvery?: number;
  retryFailedPasses?: number;
  startId: number;
}

export interface LtfIdSyncSummary {
  endId: number;
  failedAttemptCount: number;
  failedLtfIdCount: number;
  failedLtfIds: number[];
  fetchedRecords: number;
  finishedAt: string;
  insertedRecords: number;
  matchedLtfIds: number;
  requestedLtfIds: number;
  runId: string;
  softDeletedRecords: number;
  startedAt: string;
  startId: number;
  unchangedRecords: number;
  updatedRecords: number;
}

export type LtfIdSyncProgress = (
  requestedLtfIds: number,
  totalLtfIds: number
) => void;
