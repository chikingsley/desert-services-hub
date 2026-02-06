/**
 * SWPPP Boundary Extraction Experiment
 *
 * Attempt to extract disturbed area polygon from SWPPP site plan using AI vision.
 *
 * Run with: bun scripts/extract-swppp-boundary.ts
 */

import { readFileSync } from "node:fs";
import { createUserContent, GoogleGenAI } from "@google/genai";

const SWPPP_PDF =
  "tests/fixtures/pdfs/noi_swppp/SWPPP. Northern Parkway Building D -.pdf";

// Regex patterns (module-level for performance)
const RE_JSON_CODE_BLOCK_START = /```json\n?/g;
const RE_CODE_BLOCK_END = /```\n?/g;
const RE_JSON_WITH_VERTICES = /\{[\s\S]*"vertices_ft"[\s\S]*\}/;

// From NOI document
const SITE_CENTER = {
  lat: 33.561_333,
  lng: -112.391_68,
};

// Scale from drawing: 1" = 100'
// At this latitude, approximately:
// 1 degree latitude ≈ 364,000 feet
// 1 degree longitude ≈ 303,000 feet (at 33.5°N)
const FEET_PER_DEG_LAT = 364_000;
const FEET_PER_DEG_LNG = 303_000;

function feetToLatOffset(feet: number): number {
  return feet / FEET_PER_DEG_LAT;
}

function feetToLngOffset(feet: number): number {
  return feet / FEET_PER_DEG_LNG;
}

async function extractBoundaryWithGemini(): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Read PDF as base64
  const pdfBuffer = readFileSync(SWPPP_PDF);
  const pdfBase64 = pdfBuffer.toString("base64");

  console.log("Analyzing SWPPP site plan with Gemini Vision...\n");

  const prompt = `Analyze page 3 (sheet C5.2) of this SWPPP document which shows the site plan for "Lexington 420 - Building D" at NEC Reems Rd & Northern Pkwy, Glendale, Arizona.

I need you to trace the "LIMITS OF DISTURBANCE" boundary (the outer boundary line of the construction site) and provide the polygon vertices.

The drawing has:
- Scale: 1" = 100' (so you can estimate distances)
- North arrow pointing up
- Reems Road on the west side
- Northern Parkway on the south side
- Building D in the center

Please:
1. Identify the approximate dimensions of the site (width in feet east-west, height in feet north-south)
2. Describe the shape of the disturbed area boundary
3. Estimate the polygon vertices as offsets from the CENTER of the site, in feet:
   - Positive X = East
   - Negative X = West
   - Positive Y = North
   - Negative Y = South

Return ONLY a JSON object (no markdown code blocks) like:
{
  "dimensions": { "width_ft": number, "height_ft": number },
  "description": "description of the shape",
  "vertices_ft": [
    { "x": number, "y": number, "note": "description of this corner" }
  ]
}

Start from the northwest corner and go clockwise. Include enough vertices to capture the shape accurately (all major corners and any notches or jogs in the boundary).`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      {
        inlineData: {
          mimeType: "application/pdf",
          data: pdfBase64,
        },
      },
      prompt,
    ]),
  });

  const text = response.text || "";
  console.log("Gemini's Response:\n");
  console.log(text);

  // Try to extract JSON from response
  // Remove markdown code blocks if present
  const jsonStr = text
    .replace(RE_JSON_CODE_BLOCK_START, "")
    .replace(RE_CODE_BLOCK_END, "")
    .trim();

  const jsonMatch = jsonStr.match(RE_JSON_WITH_VERTICES);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      console.log("\n\n=== Extracted Data ===\n");
      console.log(
        `Site dimensions: ${data.dimensions.width_ft}' x ${data.dimensions.height_ft}'`
      );
      console.log(`Shape: ${data.description}`);
      console.log(`\nVertices (${data.vertices_ft.length} points):`);

      for (const v of data.vertices_ft) {
        console.log(`  (${v.x}, ${v.y}) - ${v.note || ""}`);
      }

      // Convert to lat/lng
      const latLngVertices = data.vertices_ft.map(
        (v: { x: number; y: number; note?: string }, i: number) => {
          const lat = SITE_CENTER.lat + feetToLatOffset(v.y);
          const lng = SITE_CENTER.lng + feetToLngOffset(v.x);
          return { lat, lng, note: v.note || `Point ${i + 1}` };
        }
      );

      console.log("\n=== Lat/Lng Coordinates ===\n");
      for (const v of latLngVertices) {
        console.log(`  ${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}  // ${v.note}`);
      }

      // Output as array for use in code
      console.log("\n=== As Code Array ===\n");
      console.log("const DISTURBED_AREA_POLYGON = [");
      for (const v of latLngVertices) {
        console.log(
          `  { lat: ${v.lat.toFixed(6)}, lng: ${v.lng.toFixed(6)} },  // ${v.note}`
        );
      }
      console.log("];");

      // Calculate approximate acreage using shoelace formula
      let area = 0;
      const n = data.vertices_ft.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += data.vertices_ft[i].x * data.vertices_ft[j].y;
        area -= data.vertices_ft[j].x * data.vertices_ft[i].y;
      }
      area = Math.abs(area) / 2;
      const acreage = area / 43_560; // sq ft to acres

      console.log("\n=== Calculated Area ===");
      console.log(`Area: ${area.toFixed(0)} sq ft`);
      console.log(`Acreage: ${acreage.toFixed(1)} acres`);
      console.log("(NOI stated: 64.3 acres disturbed)");
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      console.error("Raw text:", jsonMatch[0].substring(0, 500));
    }
  } else {
    console.error("No JSON found in response");
  }
}

// Run
extractBoundaryWithGemini().catch(console.error);
