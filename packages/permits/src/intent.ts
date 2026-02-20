import { GoogleGenAI, type Schema, Type } from "@google/genai";
import { db } from "@lib/db/client";

const { GEMINI_API_KEY } = process.env;

// Initialize the Google Gen AI client
function getGenAIClient(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

// ============================================================================
// Types
// ============================================================================

export type PermitIntent =
  | "REQUEST_NEW_PERMIT"
  | "SENDING_MISSING_DOCS"
  | "ASKING_STATUS"
  | "MUNICIPALITY_REPLY"
  | "UNRELATED";

export interface DocumentStatus {
  hasLoi: boolean;
  hasSiteMap: boolean;
  notes: string;
}

export interface PermitEmailAnalysis {
  intent: PermitIntent;
  confidence: number;
  documents: DocumentStatus;
  projectContext: string;
}

// ============================================================================
// Schemas (for Google Gen AI Structured Output)
// ============================================================================

const AnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [
        "REQUEST_NEW_PERMIT",
        "SENDING_MISSING_DOCS",
        "ASKING_STATUS",
        "MUNICIPALITY_REPLY",
        "UNRELATED",
      ],
      description: "The primary intent of the email.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence score between 0.0 and 1.0",
    },
    documents: {
      type: Type.OBJECT,
      properties: {
        hasLoi: {
          type: Type.BOOLEAN,
          description:
            "True if the email or its attachments contain a signed Letter of Authorization / Letter of Intent.",
        },
        hasSiteMap: {
          type: Type.BOOLEAN,
          description:
            "True if the email or its attachments contain a Site Map / Map / Plan.",
        },
        notes: {
          type: Type.STRING,
          description:
            "Any extra notes about the attachments (e.g., 'LOI is unsigned', 'Map is blurry').",
        },
      },
      required: ["hasLoi", "hasSiteMap", "notes"],
    },
    projectContext: {
      type: Type.STRING,
      description:
        "Any project names, addresses, or permit numbers mentioned in the text.",
    },
  },
  required: ["intent", "confidence", "documents", "projectContext"],
};

// ============================================================================
// Extraction Function
// ============================================================================

export async function analyzePermitEmail(
  subject: string,
  bodyText: string,
  attachmentNames: string[]
): Promise<PermitEmailAnalysis> {
  const client = getGenAIClient();

  const prompt = `
You are an expert permitting coordinator for Desert Services.
Read the following email subject, body, and list of attached filenames.

Determine the sender's intent regarding a Maricopa County Dust Control Permit.
Evaluate if the required documents (Letter of Intent/Authorization and Site Map) are present based on the text and attachment names.

Email Subject: ${subject}
Email Body:
${bodyText.substring(0, 3000)}

Attached Files:
${attachmentNames.length > 0 ? attachmentNames.map((n) => "- " + n).join("\n") : "No attachments."}
  `.trim();

  const response = await client.models.generateContent({
    model: "gemini-2.5-pro",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: AnalysisSchema,
      temperature: 0.1, // Low temperature for deterministic classification
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("No text returned from Gemini");
  }

  return JSON.parse(text) as PermitEmailAnalysis;
}

export async function analyzePermitEmailById(
  emailId: number
): Promise<PermitEmailAnalysis> {
  const row = await db
    .query<{
      subject: string | null;
      body_full: string | null;
      attachment_names: string[] | null;
    }>(`
    SELECT subject, body_full, attachment_names
    FROM emails
    WHERE id = $1
  `)
    .get(emailId);

  if (!row) {
    throw new Error(`Email ${emailId} not found`);
  }

  const attachments = Array.isArray(row.attachment_names) 
    ? row.attachment_names 
    : (row.attachment_names ? JSON.parse(row.attachment_names as unknown as string) : []);

  return analyzePermitEmail(
    row.subject || "",
    row.body_full || "",
    Array.isArray(attachments) ? attachments : []
  );
}
