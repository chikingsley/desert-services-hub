import { join } from "node:path";
import type { EditorEstimate } from "@lib/db/types";
import { getEstimateNumber, getEstimateWithDetails } from "@lib/estimating";
import {
  generateEstimatePDF,
  getEstimatePDFFilename,
} from "@lib/pdf/estimate/generate-estimate-pdf.server";

export interface GenerateEstimatePdfOptions {
  includeBackPage?: boolean;
  outputPath?: string;
}

export interface GenerateEstimatePdfResult {
  outputPath: string;
  estimateNumber: string;
}

export async function generateEstimatePdfById(
  estimateId: string,
  options: GenerateEstimatePdfOptions = {}
): Promise<GenerateEstimatePdfResult> {
  const details = await getEstimateWithDetails(estimateId);
  if (!details) {
    throw new Error(`Estimate not found: ${estimateId}`);
  }

  const currentVersion = details.current_version;

  const editorLineItems = currentVersion.line_items.map((i) => {
    const unitPrice = i.unit_price ?? i.unit_price;
    return {
      id: i.id,
      item: i.item_name || i.description,
      description: i.description || i.notes || "",
      qty: i.quantity,
      uom: i.unit,
      cost: unitPrice,
      total: i.quantity * unitPrice,
      sectionId: i.section_id || undefined,
    };
  });

  const computedTotal = editorLineItems.reduce((sum, i) => sum + i.total, 0);

  const estimate: EditorEstimate = {
    estimateNumber: getEstimateNumber(
      details.base_number,
      currentVersion.version_number
    ),
    date: details.created_at,
    estimator: details.estimator || "",
    estimatorEmail: details.estimator_email || "",
    billTo: {
      companyName: details.client_name || "",
      address: details.client_address || "",
      email: details.client_email || "",
      phone: details.client_phone || "",
    },
    jobInfo: {
      siteName: details.job_name,
      address: details.job_address || "",
    },
    sections: currentVersion.sections.map((s) => ({
      id: s.id,
      name: s.name,
      showSubtotal: s.show_subtotal,
    })),
    lineItems: editorLineItems,
    total: computedTotal,
  };

  const pdfBytes = await generateEstimatePDF(estimate, {
    includeBackPage: options.includeBackPage,
  });

  const outputPath =
    options.outputPath ?? join(process.cwd(), getEstimatePDFFilename(estimate));

  await Bun.write(outputPath, pdfBytes);

  return {
    outputPath,
    estimateNumber: estimate.estimateNumber,
  };
}
