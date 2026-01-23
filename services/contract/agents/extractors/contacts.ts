/**
 * Contacts Extractor (EXTR-03)
 * Extracts key personnel contact information: project manager, superintendent.
 */
import type { Mistral } from "@mistralai/mistralai";
import { EXTRACTION_MODEL, EXTRACTION_SETTINGS } from "../mistral-client";
import { type ContactsInfo, ContactsSchema } from "../schemas/contacts";

const SYSTEM_PROMPT = `You are a contract analysis expert. Extract key personnel contact information from the provided contract document.

IMPORTANT INSTRUCTIONS:
1. Only extract information explicitly stated in the document
2. Use null for any field where information is not found
3. For pageReferences, cite the page number(s) where you found the information
4. Pages are separated by "---PAGE BREAK---" markers. Page 1 is before the first marker.
5. Do not invent or assume information not present in the document

PROJECT MANAGER (PM):
- May be listed as "Project Manager", "Owner's Representative", "Construction Manager", or "Project Executive"
- May be the primary contact for the General Contractor
- Often found in signature blocks, contact sections, or "Notices" provisions
- Extract direct contact info (phone, email) not just the name

SUPERINTENDENT:
- May be listed as "Superintendent", "Site Superintendent", "Site Super", "Field Engineer", or "Field Supervisor"
- Often the on-site contact for daily operations
- May be found in safety/site sections or contact lists

WHERE TO LOOK:
- Signature blocks at the end of the document
- "Notices" or "Communications" section specifying where to send correspondence
- Contact information sections
- Exhibit or attachment pages listing personnel
- Safety plan sections listing site contacts`;

export async function extractContacts(
  fullText: string,
  mistral: Mistral
): Promise<ContactsInfo> {
  const response = await mistral.chat.parse({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: fullText },
    ],
    responseFormat: ContactsSchema,
    ...EXTRACTION_SETTINGS,
  });

  // Double-validate with Zod (belt and suspenders)
  const parsed = ContactsSchema.safeParse(
    response.choices?.[0]?.message?.parsed
  );
  if (!parsed.success) {
    throw new Error(
      `Contacts extraction validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
