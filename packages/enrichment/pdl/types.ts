/**
 * People Data Labs Type Definitions
 *
 * Types for PDL API responses with normalized result wrappers.
 */

// ============================================================================
// Person Types
// ============================================================================

export interface PDLPersonData {
  education?: {
    school?: { name?: string };
    degrees?: string[];
    majors?: string[];
    start_date?: string;
    end_date?: string;
  }[];
  emails?: { address: string; type: string }[];
  experience?: {
    title?: { name?: string };
    company?: { name?: string; website?: string };
    start_date?: string;
    end_date?: string;
    is_primary?: boolean;
  }[];
  facebook_url?: string;
  first_name?: string;
  full_name?: string;
  github_url?: string;
  id?: string;
  interests?: string[];
  job_company_name?: string;
  job_company_website?: string;
  job_title?: string;
  last_name?: string;
  linkedin_url?: string;
  location_country?: string;
  location_locality?: string;
  location_name?: string;
  location_postal_code?: string;
  location_region?: string;
  mobile_phone?: string;
  personal_emails?: string[];
  phone_numbers?: string[];
  skills?: string[];
  twitter_url?: string;
  work_email?: string;
}

export interface PersonEnrichmentResult {
  error?: string;
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
  success: boolean;
  timeMs: number;
}

export interface PersonSearchResult {
  error?: string;
  people: {
    id: string | null;
    name: string | null;
    title: string | null;
    company: string | null;
    linkedIn: string | null;
    email: string | null;
    location: string | null;
  }[];
  raw?: PDLPersonData[];
  success: boolean;
  timeMs: number;
  total: number;
}

export interface PersonIdentifyResult {
  error?: string;
  matches: {
    id: string | null;
    name: string | null;
    title: string | null;
    company: string | null;
    linkedIn: string | null;
    confidence: number;
  }[];
  success: boolean;
  timeMs: number;
}

// ============================================================================
// Company Types
// ============================================================================

export interface PDLCompanyData {
  display_name?: string;
  employee_count?: number;
  facebook_url?: string;
  founded?: number;
  headline?: string;
  id?: string;
  industry?: string;
  linkedin_url?: string;
  location?: {
    name?: string;
    street_address?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  naics?: { naics_code: string; naics_description: string }[];
  name?: string;
  size?: string;
  summary?: string;
  tags?: string[];
  twitter_url?: string;
  website?: string;
}

export interface CompanyEnrichmentResult {
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
  error?: string;
  likelihood?: number;
  raw?: PDLCompanyData;
  success: boolean;
  timeMs: number;
}

export interface CompanySearchResult {
  companies: {
    id: string | null;
    name: string;
    website: string | null;
    industry: string | null;
    employeeCount: number | null;
    location: string | null;
  }[];
  error?: string;
  raw?: PDLCompanyData[];
  success: boolean;
  timeMs: number;
  total: number;
}

export interface CompanyCleanResult {
  company?: {
    name: string;
    website: string | null;
    linkedIn: string | null;
    industry: string | null;
    size: string | null;
    founded: number | null;
    location: string | null;
  };
  error?: string;
  fuzzyMatch: boolean;
  success: boolean;
  timeMs: number;
}

// ============================================================================
// Support API Types
// ============================================================================

export interface JobTitleEnrichResult {
  error?: string;
  matches: {
    title: string;
    relevance: number;
  }[];
  skills: string[];
  success: boolean;
  timeMs: number;
}

export interface IPEnrichResult {
  error?: string;
  ip?: {
    address: string;
    company: string | null;
    location: string | null;
  };
  success: boolean;
  timeMs: number;
}

export interface LocationCleanResult {
  error?: string;
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
  success: boolean;
  timeMs: number;
}

export interface SchoolCleanResult {
  error?: string;
  school?: {
    name: string;
    type: string | null;
    website: string | null;
    linkedIn: string | null;
    location: string | null;
  };
  success: boolean;
  timeMs: number;
}

export interface AutocompleteResult {
  error?: string;
  success: boolean;
  suggestions: {
    name: string;
    count?: number;
    meta?: Record<string, unknown>;
  }[];
  timeMs: number;
}
