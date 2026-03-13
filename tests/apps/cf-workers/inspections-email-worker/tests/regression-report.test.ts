import { describe, expect, it } from "bun:test";
import {
  buildInspectionSearchTerms,
  extractStoredInspectionSiteName,
  rankInspectionFolderCandidates,
  sharePointWebUrlToDrivePath,
} from "@/apps/cf-workers/inspections-email-worker/src/regression-report";

describe("sharePointWebUrlToDrivePath", () => {
  it("decodes a SharePoint folder URL into a drive path", () => {
    const path = sharePointWebUrlToDrivePath(
      "https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/SWPPP/INSPECTIONS/PROJECTS/PROJECTS%20A-M/ARCO/KTEC%20PHX/2026",
      true
    );

    expect(path).toBe("SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/ARCO/KTEC PHX/2026");
  });

  it("strips the file name when a search result points to a PDF", () => {
    const path = sharePointWebUrlToDrivePath(
      "https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/SWPPP/INSPECTIONS/PROJECTS/PROJECTS%20N-Z/RASCH%20CONSTRUCTON%20INC/BASS%20PRO%20SHOP%20-%20TUSCON/02.26.26.pdf",
      false
    );

    expect(path).toBe(
      "SWPPP/INSPECTIONS/PROJECTS/PROJECTS N-Z/RASCH CONSTRUCTON INC/BASS PRO SHOP - TUSCON"
    );
  });
});

describe("buildInspectionSearchTerms", () => {
  it("builds unique search terms from the parsed site name", () => {
    const terms = buildInspectionSearchTerms("RASCH - BASS PRO SHOP - TUSCON", {
      contractor: "RASCH",
      project: "BASS PRO SHOP - TUSCON",
    });

    expect(terms).toEqual([
      "RASCH - BASS PRO SHOP - TUSCON",
      "BASS PRO SHOP - TUSCON",
      "RASCH",
      "BASS PRO SHOP",
      "TUSCON",
    ]);
  });
});

describe("extractStoredInspectionSiteName", () => {
  it("reads the site name from stored email body text", () => {
    const siteName = extractStoredInspectionSiteName({
      bodyText:
        "Inspection Completion Report\r\nSite/Location Name: CORE - CAPSTONE APARTMENTS\r\nSite/Location Address: 123 Main St",
      subject: "CORE - CAPSTONE APARTMENTS - Inspection Report",
    });

    expect(siteName).toBe("CORE - CAPSTONE APARTMENTS");
  });

  it("falls back to the subject when the body text is truncated", () => {
    const siteName = extractStoredInspectionSiteName({
      bodyText: "Inspection Completion Report\r\nSite Information\r\n",
      subject: "RASCH - BASS PRO SHOP - TUSCON - Inspection Report",
    });

    expect(siteName).toBe("RASCH - BASS PRO SHOP - TUSCON");
  });

  it("stops before the next field when stored text is flattened", () => {
    const siteName = extractStoredInspectionSiteName({
      bodyText:
        "Inspection Completion Report Site/Location Name: AR MAYS - SPROUTS RITA RANCH Site/Location Address: 10051 E Old Vail Rd, Tucson, AZ 85747 USA View/Download Report",
      subject: "AR MAYS - SPROUTS RITA RANCH - Inspection Report",
    });

    expect(siteName).toBe("AR MAYS - SPROUTS RITA RANCH");
  });
});

describe("rankInspectionFolderCandidates", () => {
  it("prefers an exact deterministic path match", () => {
    const ranked = rankInspectionFolderCandidates({
      siteName: "ARCO - KTEC PHX",
      parsed: { contractor: "ARCO", project: "KTEC PHX" },
      expectedFolderPath:
        "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/ARCO/KTEC PHX/2026",
      candidates: [
        {
          isFolder: true,
          name: "KTEC PHX",
          webUrl:
            "https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/SWPPP/INSPECTIONS/PROJECTS/PROJECTS%20A-M/ARCO/KTEC%20PHX/2026",
        },
        {
          isFolder: true,
          name: "KTEC PHX - OLD",
          webUrl:
            "https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/SWPPP/INSPECTIONS/PROJECTS/PROJECTS%20A-M/ARCO/KTEC%20PHX%20-%20OLD/2026",
        },
      ],
    });

    expect(ranked[0]?.matchKind).toBe("exact_path");
    expect(ranked[0]?.candidatePath).toBe(
      "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/ARCO/KTEC PHX/2026"
    );
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it("surfaces typo variants as likely near matches", () => {
    const ranked = rankInspectionFolderCandidates({
      siteName: "RASCH - BASS PRO SHOP - TUSCON",
      parsed: {
        contractor: "RASCH",
        project: "BASS PRO SHOP - TUSCON",
      },
      expectedFolderPath:
        "SWPPP/INSPECTIONS/PROJECTS/PROJECTS N-Z/RASCH/BASS PRO SHOP - TUSCON/2026",
      candidates: [
        {
          isFolder: true,
          name: "BASS PRO SHOP - TUSCON",
          webUrl:
            "https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/SWPPP/INSPECTIONS/PROJECTS/PROJECTS%20N-Z/RASCH%20CONSTRUCTON%20INC/BASS%20PRO%20SHOP%20-%20TUSCON",
        },
        {
          isFolder: true,
          name: "BASS PRO SHOPS",
          webUrl:
            "https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/Customer%20Projects/Active/R/Rasch%20Construction,%20Inc/BASS%20PRO%20SHOPS",
        },
      ],
    });

    expect(ranked[0]?.matchKind).toBe("likely_existing_folder");
    expect(ranked[0]?.candidatePath).toBe(
      "SWPPP/INSPECTIONS/PROJECTS/PROJECTS N-Z/RASCH CONSTRUCTON INC/BASS PRO SHOP - TUSCON"
    );
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(0.8);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });
});
