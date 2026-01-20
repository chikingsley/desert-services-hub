/**
 * Company Enrichment Types
 */

export type CompanyInfo = {
  name: string;
  website?: string;
  domain?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  services?: string[];
  employeeCount?: string;
  yearFounded?: string;
  licenseNumber?: string;
};

export type JinaSearchResult = {
  success: boolean;
  results: Array<{
    title: string;
    url: string;
    description: string;
  }>;
  timeMs: number;
  error?: string;
};

export type JinaReadResult = {
  success: boolean;
  markdown: string;
  tokens: number;
  timeMs: number;
  error?: string;
};

export type EnrichmentResult = {
  success: boolean;
  companyName: string;
  searchQuery: string;
  websiteUrl?: string;
  extractedInfo?: CompanyInfo;
  rawMarkdown?: string;
  steps: {
    search: { success: boolean; timeMs: number; error?: string };
    read: { success: boolean; timeMs: number; error?: string };
    process: { success: boolean; timeMs: number; error?: string };
  };
  totalTimeMs: number;
  error?: string;
};
