const BID_INVITE_PREFIX_PATTERN = /^(Reminder:\s*)?(Bid Invite:)\s*/i;
const PROJECT_SUFFIX_PATTERN = /\s+Project$/i;
const LOCATION_PATTERN = /<b>Location:\s*<\/b><span>([^<]+)<\/span>/;
const LEAD_PATTERN = /<b>Lead:\s*([^<]+)<\/b>/;
const CONTACT_PATTERN =
  /(?:Estimating Lead|Project Manager|Estimator|Senior Estimator|Pre-Construction|Preconstruction)[^•]*•\s*([^•]+)•\s*([^<]+)</;
const COMPANY_PATTERN = /<b>([^<]+)<\/b>\s*has invited you to bid/;
const DESCRIPTION_PATTERN = /<div>([^<]{20,500})<\/div>/;
const RFP_LINK_PATTERN =
  /<a[^>]*href="(https:\/\/app\.buildingconnected\.com\/goto\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;
const AMP_PATTERN = /&amp;/g;

export interface ExtractedData {
  projectName: string;
  location: string | null;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  gcCompany: string | null;
  description: string | null;
  rfpUrl: string | null;
  allLinks: Array<{ url: string; label: string }>;
}

export function extractBcData(html: string, subject: string): ExtractedData {
  const projectName = subject
    .replace(BID_INVITE_PREFIX_PATTERN, "")
    .replace(PROJECT_SUFFIX_PATTERN, "")
    .trim();

  const locMatch = html.match(LOCATION_PATTERN);
  const location = locMatch?.[1]
    ? locMatch[1].trim().replace(AMP_PATTERN, "&")
    : null;

  const leadMatch = html.match(LEAD_PATTERN);
  const leadName = leadMatch?.[1] ? leadMatch[1].trim() : null;

  const contactMatch = html.match(CONTACT_PATTERN);
  const leadPhone = contactMatch?.[1] ? contactMatch[1].trim() : null;
  const leadEmail = contactMatch?.[2] ? contactMatch[2].trim() : null;

  let gcCompany: string | null = null;
  const companyMatch = html.match(COMPANY_PATTERN);
  if (companyMatch?.[1]) {
    gcCompany = companyMatch[1].trim().replace(AMP_PATTERN, "&");
  }

  let description: string | null = null;
  const descMatch = html.match(DESCRIPTION_PATTERN);
  if (descMatch?.[1]) {
    description = descMatch[1]
      .trim()
      .replace(AMP_PATTERN, "&")
      .substring(0, 500);
  }

  const allLinks: Array<{ url: string; label: string }> = [];
  RFP_LINK_PATTERN.lastIndex = 0;
  const seen = new Set<string>();

  let match = RFP_LINK_PATTERN.exec(html);
  while (match !== null) {
    const url = match[1];
    const rawLabel = match[2];
    if (url && rawLabel && !seen.has(url)) {
      seen.add(url);
      const label = rawLabel
        .trim()
        .replace(/\s+/g, " ")
        .replace(/»/g, "")
        .trim();

      const lowerLabel = label.toLowerCase();
      if (
        label &&
        (lowerLabel.includes("view") || lowerLabel.includes("rfp")) &&
        !url.includes("state=")
      ) {
        allLinks.push({ url, label });
      }
    }

    match = RFP_LINK_PATTERN.exec(html);
  }

  const swpppLink = allLinks.find((link) =>
    link.label.toLowerCase().includes("swppp")
  );
  const rfpUrl = swpppLink?.url ?? allLinks[0]?.url ?? null;

  return {
    projectName,
    location,
    leadName,
    leadPhone,
    leadEmail,
    gcCompany,
    description,
    rfpUrl,
    allLinks,
  };
}
