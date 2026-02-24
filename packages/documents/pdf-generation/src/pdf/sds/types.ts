export interface SdsEntry {
  page: number;
  pdfPath?: string;
  supplier: string;
  tradeName: string;
  url?: string;
}

export interface SdsListDocument {
  entries: SdsEntry[];
  revision?: string;
  subtitle: string;
  title: string;
  updated: string;
}
