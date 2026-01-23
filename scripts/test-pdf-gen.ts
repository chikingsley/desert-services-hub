import { z } from "zod";
import { savePDF } from "@/lib/pdf/generate-pdf";
import type { EditorQuote } from "@/lib/types";

// 1. Define Zod Schema for EditorQuote
// matching lib/types.ts interface EditorQuote
const EditorLineItemSchema = z.object({
  id: z.string(),
  item: z.string(),
  description: z.string(),
  qty: z.number(),
  uom: z.string(),
  cost: z.number(),
  total: z.number(),
  sectionId: z.string().optional(),
  subcategoryId: z.string().optional(),
  isStruck: z.boolean().optional(),
});

const EditorSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  showSubtotal: z.boolean().optional(),
  catalogCategoryId: z.string().optional(),
});

const EditorQuoteSchema = z.object({
  estimateNumber: z.string(),
  date: z.string(), // ISO string date
  estimator: z.string(),
  estimatorEmail: z.string().email(),
  billTo: z.object({
    companyName: z.string(),
    address: z.string(),
    email: z.string().email(),
    phone: z.string(),
  }),
  jobInfo: z.object({
    siteName: z.string(),
    address: z.string(),
  }),
  sections: z.array(EditorSectionSchema),
  lineItems: z.array(EditorLineItemSchema),
  total: z.number(),
});

// 2. Create Test Data
const testQuoteData: z.infer<typeof EditorQuoteSchema> = {
  estimateNumber: "EST-2026-001",
  date: new Date().toISOString(),
  estimator: "John Doe",
  estimatorEmail: "john.doe@desertservices.com",
  billTo: {
    companyName: "Acme Construction",
    address: "123 Builder Lane\nPhoenix, AZ 85001",
    email: "accounts@acme.com",
    phone: "555-0199",
  },
  jobInfo: {
    siteName: "Sunrise Valley Lot 4",
    address: "456 Desert Blvd\nScottsdale, AZ 85255",
  },
  sections: [
    {
      id: "sec-1",
      name: "Site Preparation",
      title: "Phase 1: Site Prep",
      showSubtotal: true,
    },
    {
      id: "sec-2",
      name: "Dust Control",
      title: "Dust Control Measures",
      showSubtotal: true,
    },
  ],
  lineItems: [
    {
      id: "item-1",
      item: "Clear and Grub",
      description: "Remove vegetation and debris from site.",
      qty: 1,
      uom: "LS",
      cost: 1500,
      total: 1500,
      sectionId: "sec-1",
    },
    {
      id: "item-2",
      item: "Rough Grading",
      description: "Rough grade pad to +/- 0.1 ft.",
      qty: 5000,
      uom: "SF",
      cost: 0.5,
      total: 2500,
      sectionId: "sec-1",
    },
    {
      id: "item-3",
      item: "Water Truck",
      description: "Water truck for dust control during grading.",
      qty: 8,
      uom: "HR",
      cost: 120,
      total: 960,
      sectionId: "sec-2",
    },
    {
      id: "item-4",
      item: "Optional Fence",
      description: "Temporary fencing (Optional)",
      qty: 200,
      uom: "LF",
      cost: 5,
      total: 1000,
      isStruck: true, // Should not appear or be struck through
    },
  ],
  total: 4960,
};

// 3. Main Function

async function main() {
  const outputPath = Bun.argv[2] || "test-output.pdf";

  const inputJsonPath = Bun.argv[3];

  let dataToValidate = testQuoteData;

  if (inputJsonPath) {
    console.log(`Reading input from ${inputJsonPath}...`);

    try {
      const fileContent = await Bun.file(inputJsonPath).text();

      dataToValidate = JSON.parse(fileContent);
    } catch (error) {
      console.error(
        `Error reading input JSON file: ${(error as Error).message}`
      );

      process.exit(1);
    }
  } else {
    console.log("No input JSON provided. Using default test data...");
  }

  console.log("Validating data...");
  const validationResult = EditorQuoteSchema.safeParse(dataToValidate);

  if (!validationResult.success) {
    console.error(
      "Validation failed:",
      JSON.stringify(validationResult.error.format(), null, 2)
    );
    process.exit(1);
  }

  console.log("Data is valid. Generating PDF...");
  const quote = validationResult.data as EditorQuote;

  try {
    const filename = await savePDF(quote, outputPath, {
      includeBackPage: true,
      style: "sectioned",
    });
    console.log(`PDF successfully generated: ${filename}`);
  } catch (error) {
    console.error("Error generating PDF:", error);
    process.exit(1);
  }
}

main();
