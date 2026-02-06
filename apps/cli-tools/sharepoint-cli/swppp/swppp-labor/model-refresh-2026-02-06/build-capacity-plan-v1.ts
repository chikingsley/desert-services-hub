#!/usr/bin/env bun

/**
 * Build SWPPP backlog/capacity plan from current schedule sheets.
 *
 * Outputs:
 * - capacity-plan-v1.json
 * - capacity-plan-v1.md
 *
 * Uses:
 * - segmented model estimate for overload-safe planning
 * - work-family model estimate for typical-case planning
 */

import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = join(import.meta.dir, "../../swppp-master.db");
const MODEL_PATH = join(import.meta.dir, "swppp-model-refresh-v3.json");
const OUTPUT_DIR = import.meta.dir;
const OUTPUT_JSON = join(OUTPUT_DIR, "capacity-plan-v1.json");
const OUTPUT_MD = join(OUTPUT_DIR, "capacity-plan-v1.md");

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = {
  yardAddress: "800 N Mary St, Tempe, AZ 85288",
  crewCount: envNum("SWPPP_CREW_COUNT", 3),
  defaultCrewSize: envNum("SWPPP_CREW_SIZE", 4),
  shiftHours: envNum("SWPPP_SHIFT_HOURS", 8),
  planningUtilization: envNum("SWPPP_PLANNING_UTILIZATION", 0.8),
  // Conservative bump for tasks containing items not directly modeled in rates.
  unmodeledRiskMultiplier: envNum("SWPPP_UNMODELED_RISK_MULTIPLIER", 1.15),
} as const;

type LegacyFeature =
  | "install_panels"
  | "relocate_panels"
  | "remove_panels"
  | "install_sock_lf"
  | "relocate_sock_lf"
  | "inlets"
  | "maintenance_flag"
  | "base_setup";

type ExpandedFeature =
  | LegacyFeature
  | "install_silt_fence_lf"
  | "install_privacy_screen_lf"
  | "rock_entrance_count"
  | "rumble_grate_count"
  | "trackout_rock_tons"
  | "signs_count"
  | "stickers_count"
  | "narrative_count"
  | "delivery_flag"
  | "trip_charge_count"
  | "mobilization_count";

type WorkFamily =
  | "admin_trip"
  | "fence_screen"
  | "sock_silt"
  | "inlet"
  | "rock_trackout"
  | "mixed_install";

type TravelBand =
  | "phoenix_core"
  | "phoenix_outer"
  | "tucson_region"
  | "other_az"
  | "unknown";

type FeatureMap = Record<string, number>;

const PROD_FEATURES: ExpandedFeature[] = [
  "install_panels",
  "relocate_panels",
  "remove_panels",
  "install_sock_lf",
  "relocate_sock_lf",
  "install_silt_fence_lf",
  "install_privacy_screen_lf",
  "inlets",
  "rock_entrance_count",
  "rumble_grate_count",
  "trackout_rock_tons",
  "maintenance_flag",
  "base_setup",
];

const ADMIN_FEATURES: ExpandedFeature[] = [
  "narrative_count",
  "signs_count",
  "stickers_count",
  "delivery_flag",
  "trip_charge_count",
  "mobilization_count",
  "maintenance_flag",
  "base_setup",
];

const FAMILY_FEATURES: Record<WorkFamily, ExpandedFeature[]> = {
  admin_trip: ADMIN_FEATURES,
  fence_screen: [
    "install_panels",
    "relocate_panels",
    "remove_panels",
    "install_privacy_screen_lf",
    "maintenance_flag",
    "base_setup",
  ],
  sock_silt: [
    "install_sock_lf",
    "relocate_sock_lf",
    "install_silt_fence_lf",
    "maintenance_flag",
    "base_setup",
  ],
  inlet: ["inlets", "maintenance_flag", "base_setup"],
  rock_trackout: [
    "rock_entrance_count",
    "rumble_grate_count",
    "trackout_rock_tons",
    "maintenance_flag",
    "base_setup",
  ],
  mixed_install: PROD_FEATURES,
};

const CREW_TRAVEL_HOURS_BY_BAND: Record<TravelBand, number> = {
  phoenix_core: 0.75,
  phoenix_outer: 1.5,
  tucson_region: 4.0,
  other_az: 3.0,
  unknown: 1.5,
};

interface ModelJson {
  segmentedModel: {
    productionCoefficients: FeatureMap;
    adminCoefficients: FeatureMap;
  };
  workFamilyModel: {
    familyCoefficients: Record<WorkFamily, FeatureMap>;
  };
}

interface ScheduleRow {
  row_number: number;
  worksheet: "Confirmed Schedule" | "Need to Schedule";
  date: string | null;
  contractor: string | null;
  job_name: string | null;
  address: string | null;
  contact: string | null;
  work_description: string | null;
}

interface JobEstimate {
  rowNumber: number;
  worksheet: "Confirmed Schedule" | "Need to Schedule";
  date: string | null;
  contractor: string;
  jobName: string;
  address: string;
  contact: string;
  workDescription: string;
  workFamily: WorkFamily;
  travelBand: TravelBand;
  specialistRequired: boolean;
  specialistRoles: string[];
  riskFlags: string[];
  typicalHours: number;
  plannedSafeHours: number;
}

interface DailySummary {
  date: string;
  jobCount: number;
  totalTypicalHours: number;
  totalPlannedSafeHours: number;
  safeCapacityHours: number;
  overloadHours: number;
  overload: boolean;
}

function cleanText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseNum(raw: string): number {
  return Number.parseFloat(raw.replace(/,/g, ""));
}

function sumGroupOne(text: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags);
  let sum = 0;
  let match = re.exec(text);
  while (match !== null) {
    const n = parseNum(match[1] ?? "0");
    if (Number.isFinite(n)) {
      sum += n;
    }
    match = re.exec(text);
  }
  return sum;
}

function countMatches(text: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags);
  let c = 0;
  let match = re.exec(text);
  while (match !== null) {
    c++;
    match = re.exec(text);
  }
  return c;
}

function baseNormalizedText(raw: string): string {
  return cleanText(raw)
    .replace(/\(they have[^)]*\)/gi, " ")
    .replace(/they have [^.;]*panels? on site/gi, " ")
    .replace(/total sock installed[^.;]*/gi, " ");
}

function extractLegacyFeatures(raw: string): Record<LegacyFeature, number> {
  const text = baseNormalizedText(raw);

  let installPanels = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*(?:new\s*)?panels?\b/gi
  );

  const replaceWithNew =
    /replac(?:e|ed)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*(?:damaged\s*)?panels?[^.;]{0,80}?\bwith\b[^.;]{0,30}?\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*new\s*panels?\b/gi;
  let replaceMatch = replaceWithNew.exec(text);
  while (replaceMatch !== null) {
    const newPanels = parseNum(replaceMatch[2] ?? "0");
    if (Number.isFinite(newPanels) && newPanels > 0) {
      installPanels += newPanels;
    }
    replaceMatch = replaceWithNew.exec(text);
  }

  const relocatePanels = sumGroupOne(
    text,
    /relocat(?:e|ed)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*panels?\b/gi
  );

  let removePanels = sumGroupOne(
    text,
    /(?:remove(?:d)?|picked\s*up)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*panels?\b/gi
  );
  removePanels += sumGroupOne(
    text,
    /stockpiled?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*panels?\b/gi
  );

  const installSockLf = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,40}?\bsock\b/gi
  );

  const relocateSockLf = sumGroupOne(
    text,
    /relocat(?:e|ed)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,40}?\bsock\b/gi
  );

  const inlets = sumGroupOne(
    text,
    /protect(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?[^.;]{0,30}\binlets?\b/gi
  );

  const maintenanceFlag = /(?:\bfix(?:ed)?\b|\brepair(?:ed)?\b|\bre-?adjust\b|\bstood up\b|\btipped over\b|\bwalked the fence line\b|\bcleanup\b|\bswept\b|\bzip tied\b|\bmissing or damaged\b|\breplace\/clean\b|\bfluffed\b)/i.test(
    text
  )
    ? 1
    : 0;

  return {
    install_panels: installPanels,
    relocate_panels: relocatePanels,
    remove_panels: removePanels,
    install_sock_lf: installSockLf,
    relocate_sock_lf: relocateSockLf,
    inlets,
    maintenance_flag: maintenanceFlag,
    base_setup: 1,
  };
}

function extractExpandedFeatures(raw: string): Record<ExpandedFeature, number> {
  const text = baseNormalizedText(raw);
  const legacy = extractLegacyFeatures(raw);

  const installSiltFenceLf = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,80}?(?:silt fence|wire backed silt fence|down and dirty silt fence)\b/gi
  );

  const installPrivacyScreenLf = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*lf[^.;]{0,80}?(?:privacy screening|screening)\b/gi
  );

  let rockEntranceCount = sumGroupOne(
    text,
    /rock entrance\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?/gi
  );
  if (rockEntranceCount === 0) {
    rockEntranceCount = countMatches(
      text,
      /install(?:ed)?[^.;]{0,70}\brock entrance\b/gi
    );
  }

  const rumbleGrateCountFromQty = sumGroupOne(
    text,
    /(?:install(?:ed)?|replace(?:d)?|pick(?:ed)? up)[^.;]{0,50}\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s*grates?\b/gi
  );
  const rumbleGrateCount =
    rumbleGrateCountFromQty > 0
      ? rumbleGrateCountFromQty
      : countMatches(text, /\bgrates?\b/gi);

  const trackoutRockTons = sumGroupOne(
    text,
    /(\d[\d,]*(?:\.\d+)?)\s*tons?\s+of\s+track\s*out\s+rock/gi
  );

  const signQty = sumGroupOne(
    text,
    /install(?:ed)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?[^.;]{0,80}\bsigns?\b/gi
  );
  const signMentions = countMatches(
    text,
    /install(?:ed)?[^.;]{0,80}\bsigns?\b/gi
  );
  const signsCount = signQty > 0 ? signQty : signMentions;

  const stickerQty = sumGroupOne(
    text,
    /(?:install(?:ed)?|replace(?:d)?)\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?[^.;]{0,80}\bstickers?\b/gi
  );
  const stickersCount =
    stickerQty > 0 ? stickerQty : /\bsticker\b/i.test(text) ? 1 : 0;

  const narrativeCount = /\bnarrative\b/i.test(text) ? 1 : 0;
  const deliveryFlag = /\b(deliver(?:ed|y)?|pick(?:ed)? up)\b/i.test(text)
    ? 1
    : 0;

  const tripChargeQty = sumGroupOne(
    text,
    /trip charge\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?/gi
  );
  const tripChargeCount =
    tripChargeQty > 0 ? tripChargeQty : /\btrip charge\b/i.test(text) ? 1 : 0;

  const mobilizationQty = sumGroupOne(
    text,
    /mobilization(?: charge)?\s*\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?/gi
  );
  const mobilizationCount =
    mobilizationQty > 0
      ? mobilizationQty
      : /\bmobilization\b/i.test(text)
        ? 1
        : 0;

  return {
    ...legacy,
    install_silt_fence_lf: installSiltFenceLf,
    install_privacy_screen_lf: installPrivacyScreenLf,
    rock_entrance_count: rockEntranceCount,
    rumble_grate_count: rumbleGrateCount,
    trackout_rock_tons: trackoutRockTons,
    signs_count: signsCount,
    stickers_count: stickersCount,
    narrative_count: narrativeCount,
    delivery_flag: deliveryFlag,
    trip_charge_count: tripChargeCount,
    mobilization_count: mobilizationCount,
  };
}

function productionDomainCount(features: Record<ExpandedFeature, number>): number {
  const fenceScreen =
    features.install_panels +
      features.relocate_panels +
      features.remove_panels +
      features.install_privacy_screen_lf >
    0;
  const sockSilt =
    features.install_sock_lf +
      features.relocate_sock_lf +
      features.install_silt_fence_lf >
    0;
  const inlet = features.inlets > 0;
  const rockTrackout =
    features.rock_entrance_count +
      features.rumble_grate_count +
      features.trackout_rock_tons >
    0;
  return [fenceScreen, sockSilt, inlet, rockTrackout].filter(Boolean).length;
}

function isProduction(features: Record<ExpandedFeature, number>): boolean {
  return productionDomainCount(features) > 0;
}

function getWorkFamily(features: Record<ExpandedFeature, number>): WorkFamily {
  const domains = productionDomainCount(features);
  if (domains === 0) {
    return "admin_trip";
  }
  if (domains > 1) {
    return "mixed_install";
  }

  const fenceScreen =
    features.install_panels +
      features.relocate_panels +
      features.remove_panels +
      features.install_privacy_screen_lf >
    0;
  if (fenceScreen) {
    return "fence_screen";
  }

  const sockSilt =
    features.install_sock_lf +
      features.relocate_sock_lf +
      features.install_silt_fence_lf >
    0;
  if (sockSilt) {
    return "sock_silt";
  }
  if (features.inlets > 0) {
    return "inlet";
  }
  return "rock_trackout";
}

function dot(
  featureNames: ExpandedFeature[],
  values: Record<ExpandedFeature, number>,
  coeffs: FeatureMap
): number {
  return featureNames.reduce(
    (sum, key) => sum + (values[key] ?? 0) * (coeffs[key] ?? 0),
    0
  );
}

function getTravelBand(address: string): TravelBand {
  const text = cleanText(address);
  if (text.length === 0) {
    return "unknown";
  }

  if (/(tempe|phoenix|mesa|scottsdale|chandler|gilbert|paradise valley)/i.test(text)) {
    return "phoenix_core";
  }
  if (
    /(glendale|peoria|surprise|goodyear|avondale|buckeye|litchfield|queen creek|san tan|apache junction|maricopa|casa grande|sun city|el mirage|tolleson)/i.test(
      text
    )
  ) {
    return "phoenix_outer";
  }
  if (/(tucson|marana|oro valley|sahuarita|vail)/i.test(text)) {
    return "tucson_region";
  }
  if (/(yuma|flagstaff|prescott|sedona|payson|show low|kingman|winslow)/i.test(text)) {
    return "other_az";
  }
  return "unknown";
}

function isOnsiteTask(features: Record<ExpandedFeature, number>): boolean {
  const productionSignal =
    features.install_panels +
    features.relocate_panels +
    features.remove_panels +
    features.install_sock_lf +
    features.relocate_sock_lf +
    features.install_silt_fence_lf +
    features.install_privacy_screen_lf +
    features.inlets +
    features.rock_entrance_count +
    features.rumble_grate_count +
    features.trackout_rock_tons;

  return (
    productionSignal > 0 ||
    features.delivery_flag > 0 ||
    features.signs_count > 0 ||
    features.stickers_count > 0
  );
}

function assumedCrewSize(
  family: WorkFamily,
  features: Record<ExpandedFeature, number>
): number {
  if (family === "admin_trip") {
    return isOnsiteTask(features) ? 1 : 0;
  }
  if (family === "rock_trackout") {
    return 2;
  }
  return CONFIG.defaultCrewSize;
}

function getSpecialistRoles(
  family: WorkFamily,
  text: string,
  features: Record<ExpandedFeature, number>
): string[] {
  const roles = new Set<string>();
  const normalized = cleanText(text);

  if (
    family === "rock_trackout" ||
    features.rock_entrance_count > 0 ||
    features.rumble_grate_count > 0 ||
    features.trackout_rock_tons > 0
  ) {
    roles.add("tractor_operator");
    roles.add("rock_delivery_coordination");
  }

  if (/(backflow|water ramp|hydrant|meter|certify)/i.test(normalized)) {
    roles.add("water_setup_tech");
  }

  return [...roles];
}

function getRiskFlags(text: string): string[] {
  const normalized = cleanText(text);
  const flags: string[] = [];

  if (/\binspections?\b/.test(normalized)) {
    flags.push("inspection_count_unmodeled");
  }
  if (/\breserves?\b/.test(normalized)) {
    flags.push("reserves_unmodeled");
  }
  if (/\bswppp plan\b/.test(normalized)) {
    flags.push("plan_task_unmodeled");
  }
  if (/\bcontinue\b/.test(normalized)) {
    flags.push("continued_scope_uncertain");
  }
  return flags;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toIsoDate(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

function buildMarkdown(
  generatedAt: string,
  dailySummaries: DailySummary[],
  confirmedJobs: JobEstimate[],
  backlogJobs: JobEstimate[],
  safeCapacityHours: number,
  nominalCapacityHours: number
): string {
  const overloadDays = dailySummaries.filter((d) => d.overload);
  const totalBacklogSafe = backlogJobs.reduce((s, r) => s + r.plannedSafeHours, 0);
  const totalBacklogTypical = backlogJobs.reduce((s, r) => s + r.typicalHours, 0);
  const backlogDaysSafe =
    safeCapacityHours > 0 ? round2(totalBacklogSafe / safeCapacityHours) : 0;

  const lines: string[] = [];
  lines.push("# SWPPP Capacity Plan V1");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push("## Capacity Assumptions");
  lines.push("");
  lines.push(`- Yard: ${CONFIG.yardAddress}`);
  lines.push(`- Crews: ${CONFIG.crewCount}`);
  lines.push(`- Crew size: ${CONFIG.defaultCrewSize}`);
  lines.push(`- Shift hours: ${CONFIG.shiftHours}`);
  lines.push(`- Planning utilization: ${CONFIG.planningUtilization}`);
  lines.push(`- Nominal capacity (man-hours/day): ${round2(nominalCapacityHours)}`);
  lines.push(`- Safe planning capacity (man-hours/day): ${round2(safeCapacityHours)}`);
  lines.push("");
  lines.push("## Confirmed Schedule Summary");
  lines.push("");
  lines.push(`- Confirmed jobs analyzed: ${confirmedJobs.length}`);
  lines.push(`- Overload days: ${overloadDays.length}`);
  lines.push("");
  lines.push("| Date | Jobs | Planned Safe Hours | Typical Hours | Safe Capacity | Overload |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const day of dailySummaries) {
    lines.push(
      `| ${day.date} | ${day.jobCount} | ${round2(day.totalPlannedSafeHours)} | ${round2(day.totalTypicalHours)} | ${round2(day.safeCapacityHours)} | ${round2(day.overloadHours)} |`
    );
  }
  lines.push("");
  lines.push("## Need to Schedule Backlog");
  lines.push("");
  lines.push(`- Backlog jobs analyzed: ${backlogJobs.length}`);
  lines.push(`- Total planned safe hours: ${round2(totalBacklogSafe)}`);
  lines.push(`- Total typical hours: ${round2(totalBacklogTypical)}`);
  lines.push(`- Backlog days at safe capacity: ${backlogDaysSafe}`);
  lines.push("");

  const topBacklog = [...backlogJobs]
    .sort((a, b) => b.plannedSafeHours - a.plannedSafeHours)
    .slice(0, 20);
  lines.push("## Top Backlog Jobs (by Planned Safe Hours)");
  lines.push("");
  lines.push(
    "| Row | Date | Contractor | Job | Family | Travel | Specialist | Planned Safe Hours | Typical Hours |"
  );
  lines.push("|---:|---|---|---|---|---|---|---:|---:|");
  for (const row of topBacklog) {
    lines.push(
      `| ${row.rowNumber} | ${row.date ?? ""} | ${row.contractor} | ${row.jobName} | ${row.workFamily} | ${row.travelBand} | ${row.specialistRequired ? "yes" : "no"} | ${round2(row.plannedSafeHours)} | ${round2(row.typicalHours)} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const model = JSON.parse(readFileSync(MODEL_PATH, "utf8")) as ModelJson;
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .query<ScheduleRow, []>(
      `
      SELECT
        row_number,
        worksheet,
        date,
        contractor,
        job_name,
        address,
        contact,
        work_description
      FROM projects
      WHERE worksheet IN ('Confirmed Schedule', 'Need to Schedule')
        AND work_description IS NOT NULL
        AND trim(work_description) <> ''
      ORDER BY worksheet, date, row_number
    `
    )
    .all();

  const nominalCapacityHours =
    CONFIG.crewCount * CONFIG.defaultCrewSize * CONFIG.shiftHours;
  const safeCapacityHours = nominalCapacityHours * CONFIG.planningUtilization;

  const estimates: JobEstimate[] = rows.map((row) => {
    const workDescription = row.work_description ?? "";
    const expanded = extractExpandedFeatures(workDescription);
    const family = getWorkFamily(expanded);

    const segmentedMinutes = isProduction(expanded)
      ? dot(PROD_FEATURES, expanded, model.segmentedModel.productionCoefficients)
      : dot(ADMIN_FEATURES, expanded, model.segmentedModel.adminCoefficients);

    const familyMinutes = dot(
      FAMILY_FEATURES[family],
      expanded,
      model.workFamilyModel.familyCoefficients[family] ?? {}
    );

    const typicalModelMinutes =
      Number.isFinite(familyMinutes) && familyMinutes > 0
        ? familyMinutes
        : segmentedMinutes;

    const travelBand = getTravelBand(row.address ?? "");
    const taskCrewSize = assumedCrewSize(family, expanded);
    const onsite = isOnsiteTask(expanded);
    const crewRoundTripHours = CREW_TRAVEL_HOURS_BY_BAND[travelBand];
    const travelManHours = onsite ? crewRoundTripHours * taskCrewSize : 0;

    const riskFlags = getRiskFlags(workDescription);
    const riskMultiplier =
      riskFlags.length > 0 ? CONFIG.unmodeledRiskMultiplier : 1.0;

    const typicalHours = Math.max(0, typicalModelMinutes / 60) + travelManHours;

    let plannedSafeHours =
      (Math.max(0, segmentedMinutes / 60) + travelManHours) *
      riskMultiplier /
      CONFIG.planningUtilization;
    plannedSafeHours = Math.max(plannedSafeHours, typicalHours * 1.05);

    const specialistRoles = getSpecialistRoles(family, workDescription, expanded);

    return {
      rowNumber: row.row_number,
      worksheet: row.worksheet,
      date: toIsoDate(row.date),
      contractor: row.contractor ?? "",
      jobName: row.job_name ?? "",
      address: row.address ?? "",
      contact: row.contact ?? "",
      workDescription,
      workFamily: family,
      travelBand,
      specialistRequired: specialistRoles.length > 0,
      specialistRoles,
      riskFlags,
      typicalHours: round2(typicalHours),
      plannedSafeHours: round2(plannedSafeHours),
    };
  });

  const confirmedJobs = estimates.filter((e) => e.worksheet === "Confirmed Schedule");
  const backlogJobs = estimates.filter((e) => e.worksheet === "Need to Schedule");

  const dailyMap = new Map<string, DailySummary>();
  for (const row of confirmedJobs) {
    const key = row.date ?? "UNSCHEDULED";
    const current = dailyMap.get(key) ?? {
      date: key,
      jobCount: 0,
      totalTypicalHours: 0,
      totalPlannedSafeHours: 0,
      safeCapacityHours: round2(safeCapacityHours),
      overloadHours: 0,
      overload: false,
    };
    current.jobCount += 1;
    current.totalTypicalHours += row.typicalHours;
    current.totalPlannedSafeHours += row.plannedSafeHours;
    dailyMap.set(key, current);
  }

  const dailySummaries = [...dailyMap.values()]
    .map((d) => {
      const overloadHours = Math.max(0, d.totalPlannedSafeHours - safeCapacityHours);
      return {
        ...d,
        totalTypicalHours: round2(d.totalTypicalHours),
        totalPlannedSafeHours: round2(d.totalPlannedSafeHours),
        overloadHours: round2(overloadHours),
        overload: overloadHours > 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      dbPath: DB_PATH,
      modelPath: MODEL_PATH,
      worksheets: ["Confirmed Schedule", "Need to Schedule"],
    },
    assumptions: {
      ...CONFIG,
      nominalCapacityManHoursPerDay: round2(nominalCapacityHours),
      safeCapacityManHoursPerDay: round2(safeCapacityHours),
      travelCrewRoundTripHoursByBand: CREW_TRAVEL_HOURS_BY_BAND,
    },
    counts: {
      totalRowsAnalyzed: estimates.length,
      confirmedRowsAnalyzed: confirmedJobs.length,
      backlogRowsAnalyzed: backlogJobs.length,
      overloadDays: dailySummaries.filter((d) => d.overload).length,
    },
    dailySummaries,
    confirmedJobs,
    backlogJobs,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));

  const markdown = buildMarkdown(
    output.generatedAt,
    dailySummaries,
    confirmedJobs,
    backlogJobs,
    safeCapacityHours,
    nominalCapacityHours
  );
  writeFileSync(OUTPUT_MD, markdown);

  console.log("SWPPP Capacity Plan V1");
  console.log("======================\n");
  console.log(`Rows analyzed: ${output.counts.totalRowsAnalyzed}`);
  console.log(`Confirmed rows: ${output.counts.confirmedRowsAnalyzed}`);
  console.log(`Backlog rows: ${output.counts.backlogRowsAnalyzed}`);
  console.log(`Overload days: ${output.counts.overloadDays}`);
  console.log(`Safe capacity per day (man-hours): ${round2(safeCapacityHours)}`);
  console.log(`\nWrote: ${OUTPUT_JSON}`);
  console.log(`Wrote: ${OUTPUT_MD}`);
}

if (import.meta.main) {
  main();
}
