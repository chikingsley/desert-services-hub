/**
 * Extract dust permit data from large construction PDFs using Gemini File API
 *
 * Usage:
 *   bun experiments/extract-permit-data.ts <pdf-path>
 *   bun experiments/extract-permit-data.ts <pdf-path> --pages 1-10
 *
 * Example:
 *   bun experiments/extract-permit-data.ts "./Legacy Sports Arena Drawings.pdf"
 */

import { ApiError, createPartFromUri, GoogleGenAI } from "@google/genai";

// Types
interface OwnerInfo {
  address: string | null;
  name: string | null;
  type: string | null;
}

interface ContactInfo {
  contact: string | null;
  name: string | null;
}

interface SiteData {
  buildingArea: number | null;
  disturbedAcreage: number | null;
  parkingArea: number | null;
  totalAcreage: number | null;
}

interface Coordinates {
  latitude: number | null;
  longitude: number | null;
}

interface PermitData {
  _notes: string | null;
  apn: string | null;
  architect: ContactInfo | null;
  constructionType: string[];
  coordinates: Coordinates | null;
  engineer: ContactInfo | null;
  legalDescription: string | null;
  owner: OwnerInfo | null;
  projectName: string | null;
  siteAddress: string | null;
  siteData: SiteData | null;
}

// Constants
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max wait
const MAX_RETRIES = 3;
const MODEL = "gemini-2.5-flash";

const EXTRACTION_PROMPT = `You are analyzing construction drawings for a Maricopa County dust permit application.

Extract the following information from this PDF. Focus on:
1. The TITLE SHEET (usually page 1) - contains project info, owner, architect
2. The CIVIL/GRADING sheets (C-sheets) - contain acreage, site area, coordinates
3. The SITE PLAN - contains property boundaries and area

Return ONLY valid JSON with these fields (use null if not found, don't guess):

{
  "projectName": "string - the project name from title block",
  "siteAddress": "string - project address",
  "owner": {
    "name": "string - property owner or developer name",
    "address": "string - owner address if shown",
    "type": "string - individual, LLC, corporation, etc."
  },
  "architect": {
    "name": "string - architect of record",
    "contact": "string - phone or email if shown"
  },
  "engineer": {
    "name": "string - civil engineer",
    "contact": "string - phone or email if shown"
  },
  "siteData": {
    "totalAcreage": "number - total site area in acres",
    "disturbedAcreage": "number - area to be disturbed/graded",
    "buildingArea": "number - building square footage if shown",
    "parkingArea": "number - parking area if shown"
  },
  "coordinates": {
    "latitude": "number - if GPS coordinates shown",
    "longitude": "number - if GPS coordinates shown"
  },
  "apn": "string - Assessor Parcel Number if shown (format: XXX-XX-XXX)",
  "legalDescription": "string - Section, Township, Range if shown",
  "constructionType": ["array of activities: mass grading, vertical, utilities, paving, etc."],
  "_notes": "any other relevant observations"
}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFileProcessing(
  ai: GoogleGenAI,
  fileName: string
): Promise<{ uri: string; mimeType: string }> {
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    const file = await ai.files.get({ name: fileName });

    if (file.state === "ACTIVE") {
      if (!(file.uri && file.mimeType)) {
        throw new Error("File processed but missing uri or mimeType");
      }
      return { uri: file.uri, mimeType: file.mimeType };
    }

    if (file.state === "FAILED") {
      throw new Error(
        `File processing failed: ${file.error?.message ?? "Unknown error"}`
      );
    }

    attempts++;
    console.log(
      `  File processing... (attempt ${attempts}/${MAX_POLL_ATTEMPTS})`
    );
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("File processing timed out");
}

async function extractWithRetry(
  ai: GoogleGenAI,
  fileUri: string,
  fileMimeType: string,
  prompt: string
): Promise<PermitData> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`  Extraction attempt ${attempt}/${MAX_RETRIES}...`);

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [createPartFromUri(fileUri, fileMimeType), { text: prompt }],
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text ?? "{}";
      return JSON.parse(text) as PermitData;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof ApiError) {
        console.error(`  API Error (${error.status}): ${error.message}`);
        if (error.status === 429 || error.status >= 500) {
          // Retry on rate limit or server errors
          await sleep(5000 * attempt);
          continue;
        }
      }

      if (attempt < MAX_RETRIES) {
        console.error(`  Attempt ${attempt} failed, retrying...`);
        await sleep(2000 * attempt);
      }
    }
  }

  throw lastError ?? new Error("Extraction failed after retries");
}

async function extractPermitData(pdfPath: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not set");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  let uploadedFileName: string | null = null;

  try {
    console.log("\n=== Permit Data Extraction ===");
    console.log(`PDF: ${pdfPath}`);
    console.log(`Model: ${MODEL}\n`);

    // Step 1: Upload file
    console.log("Step 1: Uploading PDF to Gemini File API...");
    const uploadedFile = await ai.files.upload({
      file: pdfPath,
      config: { mimeType: "application/pdf" },
    });

    if (!uploadedFile.name) {
      throw new Error("Upload succeeded but no file name returned");
    }
    uploadedFileName = uploadedFile.name;
    console.log(`  Upload complete: ${uploadedFileName}`);

    // Step 2: Wait for processing
    console.log("\nStep 2: Waiting for file processing...");
    const processedFile = await waitForFileProcessing(ai, uploadedFileName);
    console.log("  File ready for analysis");

    // Step 3: Extract data
    console.log("\nStep 3: Extracting permit data...");
    const data = await extractWithRetry(
      ai,
      processedFile.uri,
      processedFile.mimeType,
      EXTRACTION_PROMPT
    );

    // Output results
    console.log("\n=== Extracted Permit Data ===\n");
    console.log(JSON.stringify(data, null, 2));

    // Summary
    console.log("\n=== Summary ===");
    console.log(`Project: ${data.projectName ?? "Not found"}`);
    console.log(`Address: ${data.siteAddress ?? "Not found"}`);
    console.log(`Owner: ${data.owner?.name ?? "Not found"}`);
    console.log(
      `Acreage: ${data.siteData?.disturbedAcreage ?? data.siteData?.totalAcreage ?? "Not found"}`
    );
    console.log(`APN: ${data.apn ?? "Not found"}`);
  } finally {
    // Cleanup
    if (uploadedFileName) {
      try {
        await ai.files.delete({ name: uploadedFileName });
        console.log("\nCleaned up uploaded file.");
      } catch (cleanupError) {
        console.warn(
          "Warning: Failed to clean up uploaded file:",
          cleanupError
        );
      }
    }
  }
}

// Main
const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: bun experiments/extract-permit-data.ts <pdf-path>");
  process.exit(1);
}

extractPermitData(pdfPath).catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
