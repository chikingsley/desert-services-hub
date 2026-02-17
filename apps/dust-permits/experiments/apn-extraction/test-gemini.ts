import { readFileSync } from "node:fs";
import { createUserContent, GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function extractAPNs() {
  const pdfPath =
    "/Users/chiejimofor/Documents/Github/desert-services-hub/files-for-work-all/Design Review Submittal - City of Surprise, AZ/001 C5.0 GRADING PLAN.pdf";

  // Read PDF as base64
  const pdfBuffer = readFileSync(pdfPath);
  const base64Data = pdfBuffer.toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: createUserContent([
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64Data,
        },
      },
      `This is an engineering grading plan PDF. Extract ALL APN (Assessor Parcel Numbers) visible anywhere on this drawing.

APNs appear as labels like "APN 501-44-993" or "APN: 501-44-XXX" usually near property boundary lines.

For each APN found, provide:
1. The APN number
2. The associated owner/company name if shown
3. Where on the drawing it appears (e.g., "north boundary", "center of site", "southwest corner")

Be extremely thorough - check all corners, margins, title block area, and along all property lines.

Return as JSON array.`,
    ]),
    config: {
      responseMimeType: "application/json",
    },
  });

  console.log("Gemini Result:");
  console.log(response.text);
}

extractAPNs().catch(console.error);
