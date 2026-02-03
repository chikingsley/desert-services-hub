/**
 * Site Info Extractor (EXTR-06)
 * Extracts site logistics: address, hours, access, safety requirements.
 */
import type { Mistral } from "@mistralai/mistralai";
import { EXTRACTION_MODEL, EXTRACTION_SETTINGS } from "../mistral-client";
import { type SiteInfo, SiteInfoSchema } from "../schemas/site-info";

const SYSTEM_PROMPT = `You are a contract analysis expert specializing in construction site logistics. Extract site information from the provided contract document.

IMPORTANT INSTRUCTIONS:
1. Only extract information explicitly stated in the document
2. Use null for any field where information is not found
3. For pageReferences, cite the page number(s) where you found the information
4. Pages are separated by "---PAGE BREAK---" markers. Page 1 is before the first marker.
5. Do not invent or assume information not present in the document

SITE ADDRESS:
- The physical job site address where work will be performed
- May differ from billing address, mailing address, or contractor's office
- Look for "Project Location", "Site Address", "Job Site", or "Work Location"
- Include full address: street, city, state, ZIP if available

SITE HOURS:
- Working hours allowed on the construction site
- May be called "Work Hours", "Site Hours", "Working Hours", or "Hours of Operation"
- Format as stated (e.g., "7am-5pm M-F", "6:00 AM to 6:00 PM Monday through Saturday")
- May include restrictions (e.g., "No work on Sundays or holidays")

ACCESS INSTRUCTIONS:
- Gate codes, check-in procedures, badge requirements
- Parking instructions
- Delivery entrance locations
- Security check-in requirements
- Look in "Site Access", "Security", or "Logistics" sections

SAFETY REQUIREMENTS:
- Required PPE (Personal Protective Equipment): hard hats, safety vests, steel toe boots
- Safety certifications: OSHA 10, OSHA 30, fall protection
- Required orientations or training
- Drug testing requirements
- Look in "Safety", "Site Requirements", or "Contractor Requirements" sections`;

export async function extractSiteInfo(
  fullText: string,
  mistral: Mistral
): Promise<SiteInfo> {
  const response = await mistral.chat.parse({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: fullText },
    ],
    responseFormat: SiteInfoSchema,
    ...EXTRACTION_SETTINGS,
  });

  // Double-validate with Zod (belt and suspenders)
  const parsed = SiteInfoSchema.safeParse(
    response.choices?.[0]?.message?.parsed
  );
  if (!parsed.success) {
    throw new Error(
      `Site info extraction validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
