/**
 * Company Enrichment Module
 *
 * Two approaches:
 * 1. PDL - Direct database lookup (100/month, no LLM needed)
 * 2. Jina + Gemini - Web scraping + AI extraction (for unknowns)
 *
 * Use smartEnrich() for automatic fallback.
 */

export { enrichCompanies, enrichCompany } from "./enrich";
export { processCompanyInfo } from "./gemini";
// Jina + Gemini (web scraping fallback)
export { findBestWebsite, readWebsite, searchCompany } from "./jina";
export type { CompanyEnrichmentResult, PDLCompany } from "./pdl";
// PDL Company Enrichment (preferred for known companies)
export { enrichCompanyByName, enrichCompanyByWebsite } from "./pdl";
// Smart Enrichment (PDL → Jina+Gemini fallback)
export { type SmartEnrichResult, smartEnrich } from "./smart-enrich";
export * from "./types";
