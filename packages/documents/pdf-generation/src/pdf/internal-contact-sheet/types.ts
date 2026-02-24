export interface InternalContactRow {
  email?: string;
  name: string;
  notes?: string;
  phone?: string;
  role: string;
}

export interface InternalContactSheetDocument {
  contacts: InternalContactRow[];
  subtitle?: string;
  title: string;
  updated: string;
}
