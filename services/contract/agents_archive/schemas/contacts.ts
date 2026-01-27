/**
 * Contacts Schema (EXTR-03)
 * Extracts key personnel contact information: PM, superintendent.
 */
import { z } from "zod";

const PersonContactSchema = z.object({
  name: z.string().nullable().describe("Person's full name"),
  phone: z.string().nullable().describe("Phone number"),
  email: z.string().nullable().describe("Email address"),
});

export const ContactsSchema = z.object({
  projectManager: PersonContactSchema.nullable().describe(
    "Project Manager contact information. Use null if not found."
  ),
  superintendent: PersonContactSchema.nullable().describe(
    "Superintendent contact information. Use null if not found."
  ),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("Page numbers where contact information was found (1-indexed)"),
});

export type ContactsInfo = z.infer<typeof ContactsSchema>;
