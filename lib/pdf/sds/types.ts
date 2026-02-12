export interface SdsEntry {
  tradeName: string;
  supplier: string;
  page: number;
  url?: string;
  pdfPath?: string;
}

export interface SdsListDocument {
  title: string;
  subtitle: string;
  updated: string;
  revision?: string;
  entries: SdsEntry[];
}
