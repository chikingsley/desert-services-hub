import { DEFAULT_USER_AGENT } from "./constants";
import type {
  MegaSearchEndpointConfig,
  MegaSearchQueryField,
} from "./megasearch-types";

export const DEFAULT_MEGASEARCH_BASE_URL =
  "https://megasearch.azdeq.gov/megasearch";

export const DEFAULT_MEGASEARCH_REFERER = `${DEFAULT_MEGASEARCH_BASE_URL}/`;

export const DEFAULT_MEGASEARCH_USER_AGENT = DEFAULT_USER_AGENT;

export const DEFAULT_QUERY_CAP = 100;

export const MEGASEARCH_ENDPOINTS: readonly MegaSearchEndpointConfig[] = [
  {
    endpoint: "sharepoint",
    checkbox: "sharepoint",
    label: "Records Center Database",
  },
  {
    endpoint: "drywell",
    checkbox: "drywell",
    label: "Drywell",
  },
  {
    endpoint: "undergroundStorage",
    checkbox: "ust",
    label: "Underground Storage Tanks and Leaking USTs",
  },
  {
    endpoint: "wastePrograms",
    checkbox: "wpd",
    label: "Waste Programs Division",
  },
  {
    endpoint: "hazardousWasteAccounts",
    checkbox: "hwa",
    label: "Hazardous Waste Accounts",
  },
  {
    endpoint: "hazardousWasteManifests",
    checkbox: "hwm",
    label: "Hazardous Waste Manifests",
  },
  {
    endpoint: "specialWasteManifests",
    checkbox: "swm",
    label: "Special Waste Manifests",
  },
  {
    endpoint: "waterQualityApp",
    checkbox: "wqapc",
    label: "Water Quality Applications",
  },
  {
    endpoint: "waterQualityPermits",
    checkbox: "wqapc",
    label: "Water Quality Permits",
  },
  {
    endpoint: "waterQualityConstruction",
    checkbox: "wqapc",
    label: "Water Quality Construction",
  },
  {
    endpoint: "wasteWaterFacilities",
    checkbox: "wwf",
    label: "Waste Water Facilities",
  },
  {
    endpoint: "waterQualityMonitoring",
    checkbox: "wqm",
    label: "Water Quality Monitoring",
  },
  {
    endpoint: "revenueManagementSystem",
    checkbox: "rms",
    label: "Revenue Management System",
  },
  {
    endpoint: "stateAssuranceFund",
    checkbox: "saf",
    label: "State Assurance Fund",
  },
  {
    endpoint: "solidWaste",
    checkbox: "pcs",
    label: "Solid Waste Cases",
  },
  {
    endpoint: "solidWasteFacilities",
    checkbox: "swf",
    label: "Solid Waste Facilities",
  },
  {
    endpoint: "solidWastePrograms",
    checkbox: "swf",
    label: "Solid Waste Programs",
  },
  {
    endpoint: "surfaceWater",
    checkbox: "sfwater",
    label: "Surface Water",
  },
  {
    endpoint: "airPermitCompliance",
    checkbox: "apc",
    label: "Air Permit Compliance",
  },
  {
    endpoint: "vehiclesEmmisions",
    checkbox: "vei",
    label: "Vehicle Emissions Inspection",
  },
  {
    endpoint: "superfundRemediation",
    checkbox: "srr",
    label: "Superfund Remediation",
  },
  {
    endpoint: "voluntaryRemediation",
    checkbox: "vmr",
    label: "Voluntary Remediation",
  },
] as const;

export const MEGASEARCH_ENDPOINT_BY_NAME = new Map(
  MEGASEARCH_ENDPOINTS.map((config) => [config.endpoint, config])
);

export const MEGASEARCH_ALPHANUMERIC_SPLIT = [
  ..."abcdefghijklmnopqrstuvwxyz0123456789",
];

export const MEGASEARCH_NUMERIC_SPLIT = [..."0123456789"];

export const MEGASEARCH_SPLIT_PLAN: ReadonlyArray<{
  field: MegaSearchQueryField;
  tokens: readonly string[];
}> = [
  {
    field: "city",
    tokens: MEGASEARCH_ALPHANUMERIC_SPLIT,
  },
  {
    field: "zip",
    tokens: MEGASEARCH_NUMERIC_SPLIT,
  },
  {
    field: "facilityName",
    tokens: MEGASEARCH_ALPHANUMERIC_SPLIT,
  },
];

export const MEGASEARCH_RECORD_ID_PREFERRED_KEYS: readonly string[] = [
  "ltfIdno",
  "idno",
  "plcIdno",
  "plcIdnoFkfld",
  "plcIdNo",
  "plcId",
  "invNumber",
  "invNum",
  "permitNo",
  "programFileNumber",
  "applicationId",
  "adeqFileNum",
  "acctId",
  "accountNumber",
  "epaId",
  "epaid",
  "rimsNo",
  "ustFacilityId",
  "lustNum",
  "pcsCase",
  "documentNumber",
  "mnfstDocNum",
  "siteCode",
  "indexVal",
];

export const MEGASEARCH_RECORD_ID_KEYS_BY_ENDPOINT: Readonly<
  Record<string, readonly string[]>
> = {
  sharepoint: ["rimsNo", "fileName", "indexVal"],
  drywell: ["regNo", "facilityName", "drywellsNo"],
  undergroundStorage: ["idno", "ustFacilityId", "lustNum"],
  wastePrograms: ["epaId", "rmcNumber", "archiveBox", "indexVal"],
  hazardousWasteAccounts: ["accountNumber", "plcIdnoFkfld", "epaid"],
  hazardousWasteManifests: ["documentNumber", "idno", "plcIdNo"],
  specialWasteManifests: ["mnfstDocNum", "plcIdnoFkfld", "acctNumber"],
  waterQualityApp: ["applicationId", "invNumber", "ltfNumber", "aznpdesNumber"],
  waterQualityPermits: ["invNumber", "permitName"],
  waterQualityConstruction: ["adeqFileNum", "projectName"],
  wasteWaterFacilities: ["invNum", "plcIdno"],
  waterQualityMonitoring: ["invNumber", "permitNo", "plcIdno", "monPoint"],
  revenueManagementSystem: ["acctId", "epaId"],
  stateAssuranceFund: ["lustNum", "plcId"],
  solidWaste: ["pcsCase", "lustNumb"],
  solidWasteFacilities: ["invNum", "plcIdno"],
  solidWastePrograms: ["plcIdno", "description", "startDt", "endDt"],
  surfaceWater: ["plcIdno", "ltfIdno", "affilStartDt"],
  airPermitCompliance: ["ltfIdno", "equipId", "plcIdno"],
  vehiclesEmmisions: ["idno", "ltfIdno", "affilStartDt"],
  superfundRemediation: ["siteCode", "plcIdno", "affilStartDt"],
  voluntaryRemediation: ["programFileNumber", "idno", "startDt"],
};
