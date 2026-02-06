# Gemini API Reference (December 2025)

Quick reference for using Google's Gemini API with `@google/genai` SDK.

## Models

| Model ID                | Best For                                 | Context   | Output     |
| ----------------------- | ---------------------------------------- | --------- | ---------- |
| `gemini-3-pro-preview`  | Complex reasoning, agentic workflows     | 1M tokens | 65K tokens |
| `gemini-2.5-pro`        | State-of-the-art thinking, complex tasks | 1M tokens | 65K tokens |
| `gemini-2.5-flash`      | Best price/performance, high volume      | 1M tokens | 65K tokens |
| `gemini-2.5-flash-lite` | Cost-efficiency, massive scale           | 1M tokens | 65K tokens |

All models support: Text, Image, Video, Audio, PDF input + structured output.

## File Size Limits

| Method           | Max Size            | Notes                                   |
| ---------------- | ------------------- | --------------------------------------- |
| **Inline Data**  | 20 MB               | Base64 encoded in request body          |
| **Files API**    | 2 GB per file       | 20 GB total per project, 48hr retention |
| **PDF Specific** | 50 MB or 1000 pages | ~258 tokens per page                    |

- \*Recommendation:\*\* Use inline for PDFs < 20MB, Files API for larger or multi-turn.

## Installation

````bash
bun add @google/genai

```text

## Basic Usage

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [{ text: "Hello, world!" }]
});

console.log(response.text);

```text

## PDF Processing

### Inline (< 20MB)

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const pdfBuffer = await Bun.file("./document.pdf").arrayBuffer();

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    { text: "Extract all data from this document" },
    {
      inlineData: {
        mimeType: "application/pdf",
        data: Buffer.from(pdfBuffer).toString("base64")
      }
    }
  ]
});

console.log(response.text);

```text

### Files API (> 20MB or multi-turn)

```typescript
import { GoogleGenAI, createPartFromUri } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Upload file
const pdfBuffer = await Bun.file("./large-document.pdf").arrayBuffer();
const fileBlob = new Blob([pdfBuffer], { type: "application/pdf" });

const file = await ai.files.upload({
  file: fileBlob,
  config: { displayName: "large-document.pdf" }
});

// Wait for processing
let processedFile = await ai.files.get({ name: file.name });
while (processedFile.state === "PROCESSING") {
  await Bun.sleep(2000);
  processedFile = await ai.files.get({ name: file.name });
}

// Use in request
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    { text: "Summarize this document" },
    createPartFromUri(processedFile.uri!, processedFile.mimeType!)
  ]
});

console.log(response.text);

```text

## Structured Output

Force JSON response matching a schema:

```typescript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    { text: "Extract invoice data" },
    { inlineData: { mimeType: "application/pdf", data: base64Pdf } }
  ],
  config: {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        invoiceNumber: { type: "STRING" },
        date: { type: "STRING" },
        total: { type: "NUMBER" },
        lineItems: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              description: { type: "STRING" },
              quantity: { type: "NUMBER" },
              price: { type: "NUMBER" }
            }
          }
        }
      },
      required: ["invoiceNumber", "date", "total"]
    }
  }
});

const data = JSON.parse(response.text);

```text

## Multiple PDFs

```typescript
const pdf1 = await Bun.file("./doc1.pdf").arrayBuffer();
const pdf2 = await Bun.file("./doc2.pdf").arrayBuffer();

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    { text: "Compare these two documents" },
    { inlineData: { mimeType: "application/pdf", data: Buffer.from(pdf1).toString("base64") } },
    { inlineData: { mimeType: "application/pdf", data: Buffer.from(pdf2).toString("base64") } }
  ]
});

```text

## Schema Types

```typescript
// Available types for responseSchema
type SchemaType = "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "ARRAY" | "OBJECT";

// Full schema structure
interface Schema {
  type: SchemaType;
  description?: string;
  properties?: Record<string, Schema>;  // For OBJECT
  items?: Schema;                        // For ARRAY
  required?: string[];                   // For OBJECT
  enum?: string[];                       // For STRING with fixed values
}

```text

## Error Handling

```typescript
import { GoogleGenAI, ApiError } from "@google/genai";

try {
  const response = await ai.models.generateContent({...});
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API Error: ${error.status} - ${error.message}`);
  }
  throw error;
}

```text

## Sources

- [Gemini Models](https://ai.google.dev/gemini-api/docs/models)
- [Document Processing](https://ai.google.dev/gemini-api/docs/document-processing)
- [Files API](https://ai.google.dev/api/files)
- [Structured Output](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output)
- [js-genai SDK](https://github.com/googleapis/js-genai)
- [File Size Limits](https://www.datastudios.org/post/google-gemini-file-upload-size-limits-supported-types-and-advanced-document-processing)
````
