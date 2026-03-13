import { describe, expect, it } from "bun:test";
import { WORKSHEETS } from "@sharepoint/swppp/config";
import type { SwpppProject } from "@sharepoint/swppp/client";
import {
  buildCanonicalProjectPath,
  buildCanonicalProjectDiff,
  summarizeCurrentInspectionProjects,
  summarizeSourceProjects,
} from "@/apps/cf-workers/inspections-email-worker/src/canonical-diff";

function makeProject(
  overrides: Partial<SwpppProject> & Pick<SwpppProject, "contractor" | "jobName">
): SwpppProject {
  return {
    address: "",
    comments: "",
    contact: "",
    contractor: overrides.contractor,
    date: null,
    dateEntered: null,
    invoice: "",
    jobName: overrides.jobName,
    phone: "",
    rowNumber: overrides.rowNumber ?? 2,
    workCompleted: "",
    workDescription: "",
    worksheet: overrides.worksheet ?? WORKSHEETS.NEED_TO_SCHEDULE,
  };
}

describe("buildCanonicalProjectPath", () => {
  it("builds the canonical inspection project path from the source project", () => {
    const path = buildCanonicalProjectPath({
      contractor: "AR MAYS CONSTRUCTION",
      jobName: "SPROUTS RITA RANCH",
    });

    expect(path).toBe(
      "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/AR MAYS CONSTRUCTION/SPROUTS RITA RANCH"
    );
  });

  it("sanitizes names for SharePoint-safe canonical paths", () => {
    const path = buildCanonicalProjectPath({
      contractor: "G & J DEVELOPMENT",
      jobName: "A/B:C*D",
    });

    expect(path).toBe(
      "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/G & J DEVELOPMENT/A_B_C_D"
    );
  });
});

describe("summarizeSourceProjects", () => {
  it("deduplicates exact canonical rows and preserves worksheet provenance", () => {
    const summarized = summarizeSourceProjects([
      makeProject({
        contractor: "AR MAYS CONSTRUCTION",
        jobName: "SPROUTS RITA RANCH",
        rowNumber: 10,
        worksheet: WORKSHEETS.NEED_TO_SCHEDULE,
      }),
      makeProject({
        contractor: "AR MAYS CONSTRUCTION",
        jobName: "SPROUTS RITA RANCH",
        rowNumber: 22,
        worksheet: WORKSHEETS.CONFIRMED_SCHEDULE,
      }),
      makeProject({
        contractor: "AR MAYS CONSTRUCTION",
        jobName: "ESTRELLA SELF STORAGE",
        rowNumber: 40,
      }),
    ]);

    expect(summarized).toHaveLength(2);
    expect(summarized[0]?.canonicalPath).toBe(
      "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/AR MAYS CONSTRUCTION/ESTRELLA SELF STORAGE"
    );
    expect(summarized[1]?.sourceCount).toBe(2);
    expect(summarized[1]?.worksheets).toEqual([
      WORKSHEETS.CONFIRMED_SCHEDULE,
      WORKSHEETS.NEED_TO_SCHEDULE,
    ]);
  });
});

describe("summarizeCurrentInspectionProjects", () => {
  it("reduces raw SharePoint project folders into unique project summaries", () => {
    const summarized = summarizeCurrentInspectionProjects([
      {
        path: "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/AR MAYS CONSTRUCTION/SPROUTS RITA RANCH",
        yearFolders: ["2025", "2026"],
      },
      {
        path: "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/AR MAYS CONSTRUCTION/ESTRELLA SELF STORAGE",
        yearFolders: ["2026"],
      },
    ]);

    expect(summarized).toHaveLength(2);
    expect(summarized[0]?.contractor).toBe("AR MAYS CONSTRUCTION");
    expect(summarized[0]?.project).toBe("ESTRELLA SELF STORAGE");
    expect(summarized[1]?.yearFolders).toEqual(["2025", "2026"]);
  });
});

describe("buildCanonicalProjectDiff", () => {
  it("classifies exact, missing, and extra project folders", () => {
    const sourceProjects = summarizeSourceProjects([
      makeProject({
        contractor: "AR MAYS CONSTRUCTION",
        jobName: "SPROUTS RITA RANCH",
      }),
      makeProject({
        contractor: "AR MAYS CONSTRUCTION",
        jobName: "ESTRELLA SELF STORAGE",
      }),
    ]);
    const currentProjects = summarizeCurrentInspectionProjects([
      {
        path: "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/AR MAYS CONSTRUCTION/SPROUTS RITA RANCH",
        yearFolders: ["2026"],
      },
      {
        path: "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/AR MAYS/ESTRELLA",
        yearFolders: ["2026"],
      },
      {
        path: "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/AR MAYS CONSTRUCTION/OLD JOB",
        yearFolders: ["2024"],
      },
    ]);

    const diff = buildCanonicalProjectDiff(sourceProjects, currentProjects);

    expect(diff.exactMatches).toHaveLength(1);
    expect(diff.missingCanonical).toHaveLength(1);
    expect(diff.missingCanonical[0]?.canonical.jobName).toBe(
      "ESTRELLA SELF STORAGE"
    );
    expect(diff.missingCanonical[0]?.topCandidates[0]?.path).toBe(
      "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/AR MAYS/ESTRELLA"
    );
    expect(diff.extraSharePoint).toHaveLength(2);
  });
});
