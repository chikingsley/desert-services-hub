export interface InternalContactRow {
  role: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface InternalContactSheetDocument {
  title: string;
  subtitle?: string;
  updated: string;
  contacts: InternalContactRow[];
}
