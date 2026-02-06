/**
 * People Data Labs Type Definitions
 *
 * Types for PDL API responses with normalized result wrappers.
 */

// ============================================================================
// Person Types
// ============================================================================

export interface PDLPersonData {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  job_company_name?: string;
  job_company_website?: string;
  linkedin_url?: string;
  facebook_url?: string;
  twitter_url?: string;
  github_url?: string;
  phone_numbers?: string[];
  mobile_phone?: string;
  work_email?: string;
  personal_emails?: string[];
  emails?: Array<{ address: string; type: string }>;
  location_name?: string;
  location_locality?: string;
  location_region?: string;
  location_country?: string;
  location_postal_code?: string;
  skills?: string[];
  interests?: string[];
  experience?: Array<{
    title?: { name?: string };
    company?: { name?: string; website?: string };
    start_date?: string;
    end_date?: string;
    is_primary?: boolean;
  }>;
  education?: Array<{
    school?: { name?: string };
    degrees?: string[];
    majors?: string[];
    start_date?: string;
    end_date?: string;
  }>;
}

export interface PersonEnrichmentResult {
  success: boolean;
  likelihood?: number;
  person?: {
    id: string | null;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    company: string | null;
    companyWebsite: string | null;
    linkedIn: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    skills: string[];
  };
  raw?: PDLPersonData;
  timeMs: number;
  error?: string;
}

export interface PersonSearchResult {
  success: boolean;
  total: number;
  people: Array<{
    id: string | null;
    name: string | null;
    title: string | null;
    company: string | null;
    linkedIn: string | null;
    email: string | null;
    location: string | null;
  }>;
  raw?: PDLPersonData[];
  timeMs: number;
  error?: string;
}

export interface PersonIdentifyResult {
  success: boolean;
  matches: Array<{
    id: string | null;
    name: string | null;
    title: string | null;
    company: string | null;
    linkedIn: string | null;
    confidence: number;
  }>;
  timeMs: number;
  error?: string;
}

// ============================================================================
// Company Types
// ============================================================================

export interface PDLCompanyData {
  id?: string;
  name?: string;
  display_name?: string;
  website?: string;
  linkedin_url?: string;
  facebook_url?: string;
  twitter_url?: string;
  founded?: number;
  employee_count?: number;
  size?: string;
  industry?: string;
  headline?: string;
  summary?: string;
  tags?: string[];
  location?: {
    name?: string;
    street_address?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  naics?: Array<{ naics_code: string; naics_description: string }>;
}

export interface CompanyEnrichmentResult {
  success: boolean;
  likelihood?: number;
  company?: {
    id: string | null;
    name: string;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    description: string | null;
    employeeCount: number | null;
    founded: number | null;
    industry: string | null;
    linkedIn: string | null;
    tags: string[];
  };
  raw?: PDLCompanyData;
  timeMs: number;
  error?: string;
}

export interface CompanySearchResult {
  success: boolean;
  total: number;
  companies: Array<{
    id: string | null;
    name: string;
    website: string | null;
    industry: string | null;
    employeeCount: number | null;
    location: string | null;
  }>;
  raw?: PDLCompanyData[];
  timeMs: number;
  error?: string;
}

export interface CompanyCleanResult {
  success: boolean;
  company?: {
    name: string;
    website: string | null;
    linkedIn: string | null;
    industry: string | null;
    size: string | null;
    founded: number | null;
    location: string | null;
  };
  fuzzyMatch: boolean;
  timeMs: number;
  error?: string;
}

// ============================================================================
// Support API Types
// ============================================================================

export interface JobTitleEnrichResult {
  success: boolean;
  matches: Array<{
    title: string;
    relevance: number;
  }>;
  skills: string[];
  timeMs: number;
  error?: string;
}

export interface IPEnrichResult {
  success: boolean;
  ip?: {
    address: string;
    company: string | null;
    location: string | null;
  };
  timeMs: number;
  error?: string;
}

export interface LocationCleanResult {
  success: boolean;
  location?: {
    name: string | null;
    locality: string | null;
    region: string | null;
    country: string | null;
    continent: string | null;
    postalCode: string | null;
    type: string | null;
    geo: { lat: number; lng: number } | null;
  };
  timeMs: number;
  error?: string;
}

export interface SchoolCleanResult {
  success: boolean;
  school?: {
    name: string;
    type: string | null;
    website: string | null;
    linkedIn: string | null;
    location: string | null;
  };
  timeMs: number;
  error?: string;
}

export interface AutocompleteResult {
  success: boolean;
  suggestions: Array<{
    name: string;
    count?: number;
    meta?: Record<string, unknown>;
  }>;
  timeMs: number;
  error?: string;
}
