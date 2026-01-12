// Transform Hub EditorQuote to PDF Quote format
import type { EditorQuote } from "@/lib/types";
import type { PDFQuote } from "./types";

// Default values for PDF generation
const DEFAULT_ESTIMATOR = "Desert Services";
const DEFAULT_ESTIMATOR_EMAIL = "info@desertservices.net";

/**
 * Transforms the hub's EditorQuote format to the PDF Quote format
 * required by the PDF generator.
 *
 * Key transformations:
 * - jobInfo.siteName → project.name
 * - jobInfo.address → siteAddress.line1
 * - billTo.email/phone → attn object
 * - Filters out struck/excluded line items
 */
export function transformEditorQuoteToPDFQuote(
  editorQuote: EditorQuote
): PDFQuote {
  return {
    estimateNumber: editorQuote.estimateNumber,
    date: editorQuote.date,
    estimator: editorQuote.estimator || DEFAULT_ESTIMATOR,
    estimatorEmail: editorQuote.estimatorEmail || DEFAULT_ESTIMATOR_EMAIL,

    billTo: {
      companyName: editorQuote.billTo.companyName || "Unknown Company",
      address: editorQuote.billTo.address || undefined,
    },

    // Include attn if we have contact info
    attn:
      editorQuote.billTo.email || editorQuote.billTo.phone
        ? {
            name: editorQuote.billTo.companyName || "",
            email: editorQuote.billTo.email || undefined,
            phone: editorQuote.billTo.phone || undefined,
          }
        : undefined,

    project: {
      name: editorQuote.jobInfo.siteName || "Untitled Project",
    },

    siteAddress: {
      line1: editorQuote.jobInfo.address || "",
    },

    sections: editorQuote.sections.map((section) => ({
      id: section.id,
      name: section.name,
      showSubtotal: false, // Can be configured per-section if needed
    })),

    // Filter out struck items - they shouldn't appear on the final PDF
    lineItems: editorQuote.lineItems
      .filter((item) => !item.isStruck)
      .map((item) => ({
        id: item.id,
        item: item.item || item.description,
        description: item.description || item.item,
        qty: item.qty,
        uom: item.uom,
        cost: item.cost,
        total: item.total,
        sectionId: item.sectionId,
      })),

    total: editorQuote.total,
  };
}
