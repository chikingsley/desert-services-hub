// PDF Quote Types
// These match the workbench format expected by the PDF generator

export interface PDFLineItem {
  id: string;
  item: string; // catalog code or description
  description: string;
  qty: number;
  uom: string;
  cost: number;
  total: number;
  sectionId?: string;
}

export interface PDFQuoteSection {
  id: string;
  name: string;
  showSubtotal?: boolean;
}

export interface PDFQuote {
  id?: string;
  estimateNumber: string;
  date: string;
  estimator: string;
  estimatorEmail: string;
  billTo: {
    companyName: string;
    address?: string;
    address2?: string;
  };
  attn?: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
  };
  project: {
    name: string;
    name2?: string;
  };
  siteAddress: {
    line1: string;
    line2?: string;
  };
  sections: PDFQuoteSection[];
  lineItems: PDFLineItem[];
  total: number;
}
