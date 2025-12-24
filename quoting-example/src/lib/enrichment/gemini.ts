/**
 * Gemini AI integration for processing company information
 * Uses @google/genai SDK with gemini-3-flash-preview
 */

import { GoogleGenAI } from "@google/genai";
import type { CompanyInfo } from "./types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// JSON Schema for structured company info extraction
const companyInfoSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Official company name" },
    website: { type: "string", description: "Company website URL" },
    domain: { type: "string", description: "Primary domain" },
    description: {
      type: "string",
      description: "Brief company description (1-2 sentences)",
    },
    address: { type: "string", description: "Street address" },
    city: { type: "string", description: "City" },
    state: { type: "string", description: "State (2-letter code)" },
    zip: { type: "string", description: "ZIP code" },
    phone: { type: "string", description: "Main phone number" },
    email: { type: "string", description: "Contact email" },
    services: {
      type: "array",
      items: { type: "string" },
      description: "List of services offered",
    },
    employeeCount: { type: "string", description: "Employee count or range" },
    yearFounded: { type: "string", description: "Year company was founded" },
    licenseNumber: { type: "string", description: "Contractor license number" },
  },
  required: ["name"],
} as const;

/**
 * Process website content and extract structured company information
 */
export async function processCompanyInfo(
  markdown: string,
  companyName: string
): Promise<{
  success: boolean;
  info?: CompanyInfo;
  timeMs: number;
  error?: string;
}> {
  const start = Date.now();

  if (!GEMINI_API_KEY) {
    return {
      success: false,
      timeMs: Date.now() - start,
      error: "GEMINI_API_KEY not set",
    };
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `Extract company information from this website content.

Company name we're looking for: ${companyName}

Website content:
${markdown.slice(0, 8000)}

Extract and return structured information about this company. Only include fields where you find actual data. Return valid JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: companyInfoSchema,
      },
    });

    const timeMs = Date.now() - start;
    const result = JSON.parse(response.text || "{}") as CompanyInfo;

    return {
      success: true,
      info: result,
      timeMs,
    };
  } catch (error) {
    return {
      success: false,
      timeMs: Date.now() - start,
      error: String(error),
    };
  }
}
