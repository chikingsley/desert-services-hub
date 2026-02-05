import { GoogleGenAI, Type } from "@google/genai";

// Initialize the Google GenAI client using the API key directly from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeEmail = async (emailBody: string, subject: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this construction-related email and return classification, a short summary, and suggested next steps. Subject: ${subject}. Body: ${emailBody}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              description:
                "Project category e.g. Contract, Permit, Billing, Inquiry",
            },
            summary: { type: Type.STRING, description: "One sentence summary" },
            suggestedProject: {
              type: Type.STRING,
              description: "Name of existing project it likely belongs to",
            },
            nextSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });
    // Property access .text is correct according to guidelines.
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Analysis failed", error);
    return null;
  }
};

export const generateTemplateResponse = async (
  context: string,
  templateType: string
) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a professional email reply for a ${templateType} based on this context: ${context}. Keep it concise and professional.`,
    });
    return response.text;
  } catch (error) {
    console.error("Template generation failed", error);
    return "Failed to generate template.";
  }
};
