import {
  generateEstimatePDF,
  getEstimatePDFFilename,
} from "@documents/pdf/estimate/generate-estimate-pdf.server";
import { db } from "@lib/db/client";
import type {
  EditorEstimate,
  EditorLineItem,
  EditorSection,
  EstimateLineItemRow,
  EstimateRow,
  EstimateSectionRow,
} from "@lib/db/types";
import {
  type BunRequest,
  getPreferredEstimateVersion,
  parseEstimateId,
} from "@/api/estimates/by-id/shared";

function requireText(value: string | null | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${field} is required for estimate PDF generation`);
  }
  return trimmed;
}

function optionalText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function requireLineItemName(itemName: string | null, index: number): string {
  const trimmed = itemName?.trim();
  if (!trimmed) {
    throw new Error(
      `line_items[${index}].item_name is required for estimate PDF generation`
    );
  }
  return trimmed;
}

export async function handleGetEstimatePdf(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = (await db
      .query("SELECT * FROM estimates WHERE id = $1")
      .get(id)) as EstimateRow | undefined;

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const version = await getPreferredEstimateVersion(id);

    const sectionsData = version
      ? ((await db
          .query(
            "SELECT * FROM estimate_sections WHERE version_id = $1 ORDER BY sort_order"
          )
          .all(version.id)) as EstimateSectionRow[])
      : [];

    const lineItemsData = version
      ? ((await db
          .query(
            "SELECT * FROM estimate_line_items WHERE version_id = $1 ORDER BY sort_order"
          )
          .all(version.id)) as EstimateLineItemRow[])
      : [];

    // Convert to EditorEstimate format
    const sections: EditorSection[] = sectionsData.map((section) => ({
      id: section.id,
      name: section.name,
    }));

    const lineItems: EditorLineItem[] = lineItemsData.map((item, index) => ({
      id: item.id,
      item: requireLineItemName(item.item_name, index),
      description: item.description,
      qty: item.quantity,
      uom: item.unit,
      cost: item.unit_price,
      total: item.quantity * item.unit_price,
      sectionId: item.section_id || undefined,
      isAlternate: item.is_excluded === 1,
    }));

    const total = lineItems.reduce((sum, item) => sum + item.total, 0);

    const createdAtValue =
      typeof estimate.created_at === "string" && estimate.created_at.length > 0
        ? estimate.created_at
        : new Date().toISOString();

    const editorEstimate: EditorEstimate = {
      estimateNumber: requireText(estimate.base_number, "base_number"),
      date: createdAtValue,
      estimator: requireText(estimate.estimator, "estimator"),
      estimatorEmail: optionalText(estimate.estimator_email),
      billTo: {
        companyName: requireText(estimate.contractor, "contractor"),
        address: requireText(estimate.client_address, "client_address"),
        email: "",
        phone: "",
      },
      jobInfo: {
        siteName: requireText(estimate.job_name, "job_name"),
        address: requireText(estimate.job_address, "job_address"),
      },
      sections,
      lineItems,
      total,
    };

    const pdfBytes = await generateEstimatePDF(editorEstimate);
    const filename = getEstimatePDFFilename(editorEstimate);

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
