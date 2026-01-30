/**
 * Spam Filter
 *
 * Filters out marketing, newsletter, and spam emails from sync.
 * Add patterns here - keeps sync-all.ts clean.
 */

// Domains that are always spam/marketing
const SPAM_DOMAINS = [
  "emdeals.michaels.com",
  "em.michaelscustomframing.com",
  "e-email.guns.com",
  "em.azcardinals.com",
  "campaign.eventbrite.com",
  "e.shrm.org",
  "news.pitchbook.com",
  "rfg.realfinancialgain.com",
  "ccsend.com", // Constant Contact
  "mail.beehiiv.com",
  "email.mg1.substack.com",
  "mailchimp.com",
  "sendgrid.net",
  "klaviyo.com",
];

// Sender patterns that indicate marketing/spam
const SPAM_SENDER_PATTERNS = [
  /^marketing@/i,
  /^newsletter/i,
  /^promo(tions)?@/i,
  /^deals@/i,
  /^offers@/i,
  /^sales@/i,
  /^hrcimarketing@/i,
  /@em\./i, // Common marketing subdomain pattern
  /@e\./i, // Another common one
  /@mail\./i,
  /@news-noreply\./i,
];

// noreply addresses that are likely spam (be careful - some are legit)
const SPAM_NOREPLY_DOMAINS = [
  "strety.com",
  "hireright.com",
  "campaign.eventbrite.com",
  "t-mobileforbusiness.t-mobile.com",
  "tenstreet.com",
];

// Subject patterns that indicate spam
const SPAM_SUBJECT_PATTERNS = [
  /% off/i,
  /free shipping/i,
  /limited time/i,
  /act now/i,
  /don't miss/i,
  /sale ends/i,
  /unsubscribe/i,
  /your order has shipped/i, // Personal shopping, not work
  /your .* is on the way/i,
  /🧶|🎁|💖|🛒|🛍️/, // Shopping emojis in subject
];

// Legitimate senders that might match patterns but should be allowed
const ALLOWLIST_DOMAINS = [
  "buildingconnected.com",
  "procore.com",
  "plangrid.com",
  "bluebeam.com",
  "textura.com",
  "gcpay.com",
  "vertafore.com", // Insurance
  "wasteconnections.com", // Legitimate vendor
  "republicservices.com", // Legitimate vendor
  "slimcd.com", // Payment processing
  "pointandpay.com", // Payment processing
  "indeed.com", // Job postings might be relevant
  "linkedin.com", // Business networking
];

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
}

/**
 * Check if an email is spam based on sender and subject.
 */
export function isSpam(
  fromEmail: string | null | undefined,
  subject: string | null | undefined
): SpamCheckResult {
  if (!fromEmail) {
    return { isSpam: false };
  }

  const email = fromEmail.toLowerCase();
  const subj = subject?.toLowerCase() || "";

  // Extract domain from email
  const domainMatch = email.match(/@([^>]+)/);
  const domain = domainMatch ? domainMatch[1] : "";

  // Check allowlist first
  for (const allowed of ALLOWLIST_DOMAINS) {
    if (domain.includes(allowed)) {
      return { isSpam: false };
    }
  }

  // Check spam domains
  for (const spamDomain of SPAM_DOMAINS) {
    if (domain.includes(spamDomain)) {
      return { isSpam: true, reason: `spam_domain:${spamDomain}` };
    }
  }

  // Check spam sender patterns
  for (const pattern of SPAM_SENDER_PATTERNS) {
    if (pattern.test(email)) {
      return { isSpam: true, reason: `sender_pattern:${pattern.source}` };
    }
  }

  // Check spam noreply domains
  if (email.includes("noreply@") || email.includes("no-reply@")) {
    for (const spamNoreply of SPAM_NOREPLY_DOMAINS) {
      if (domain.includes(spamNoreply)) {
        return { isSpam: true, reason: `spam_noreply:${spamNoreply}` };
      }
    }
  }

  // Check subject patterns
  for (const pattern of SPAM_SUBJECT_PATTERNS) {
    if (pattern.test(subj)) {
      return { isSpam: true, reason: `subject_pattern:${pattern.source}` };
    }
  }

  return { isSpam: false };
}

/**
 * Filter an array of emails, removing spam.
 * Returns { kept, filtered } arrays.
 */
export function filterSpam<
  T extends { fromEmail?: string | null; subject?: string | null },
>(emails: T[]): { kept: T[]; filtered: T[] } {
  const kept: T[] = [];
  const filtered: T[] = [];

  for (const email of emails) {
    const result = isSpam(email.fromEmail, email.subject);
    if (result.isSpam) {
      filtered.push(email);
    } else {
      kept.push(email);
    }
  }

  return { kept, filtered };
}

/**
 * Get spam statistics for the current database.
 */
export function getSpamStats(
  emails: Array<{ fromEmail?: string | null; subject?: string | null }>
): {
  total: number;
  spam: number;
  clean: number;
  topReasons: Map<string, number>;
} {
  const topReasons = new Map<string, number>();
  let spam = 0;

  for (const email of emails) {
    const result = isSpam(email.fromEmail, email.subject);
    if (result.isSpam && result.reason) {
      spam++;
      topReasons.set(result.reason, (topReasons.get(result.reason) || 0) + 1);
    }
  }

  return {
    total: emails.length,
    spam,
    clean: emails.length - spam,
    topReasons,
  };
}
