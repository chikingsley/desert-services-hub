/**
 * Spam Filter
 *
 * Filters out marketing, newsletter, and spam emails from sync.
 */

const SPAM_DOMAINS = [
  "emdeals.michaels.com",
  "em.michaelscustomframing.com",
  "e-email.guns.com",
  "em.azcardinals.com",
  "campaign.eventbrite.com",
  "e.shrm.org",
  "news.pitchbook.com",
  "rfg.realfinancialgain.com",
  "ccsend.com",
  "mail.beehiiv.com",
  "email.mg1.substack.com",
  "mailchimp.com",
  "sendgrid.net",
  "klaviyo.com",
];

const SPAM_SENDER_PATTERNS = [
  /^marketing@/i,
  /^newsletter/i,
  /^promo(tions)?@/i,
  /^deals@/i,
  /^offers@/i,
  /^sales@/i,
  /^hrcimarketing@/i,
  /@em\./i,
  /@e\./i,
  /@mail\./i,
  /@news-noreply\./i,
];

const SPAM_NOREPLY_DOMAINS = [
  "strety.com",
  "hireright.com",
  "campaign.eventbrite.com",
  "t-mobileforbusiness.t-mobile.com",
  "tenstreet.com",
];

const SPAM_SUBJECT_PATTERNS = [
  /% off/i,
  /free shipping/i,
  /limited time/i,
  /act now/i,
  /don't miss/i,
  /sale ends/i,
  /unsubscribe/i,
  /your order has shipped/i,
  /your .* is on the way/i,
  /🧶|🎁|💖|🛒|🛍️/,
];

const RE_EMAIL_DOMAIN = /@([^>]+)/;

const ALLOWLIST_DOMAINS = [
  "buildingconnected.com",
  "procore.com",
  "plangrid.com",
  "bluebeam.com",
  "textura.com",
  "gcpay.com",
  "vertafore.com",
  "wasteconnections.com",
  "republicservices.com",
  "slimcd.com",
  "pointandpay.com",
  "indeed.com",
  "linkedin.com",
  "hellosign.com",
];

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
}

export function isSpam(
  fromEmail: string | null | undefined,
  subject: string | null | undefined
): SpamCheckResult {
  if (!fromEmail) {
    return { isSpam: false };
  }

  const email = fromEmail.toLowerCase();
  const subj = subject?.toLowerCase() || "";

  const domainMatch = email.match(RE_EMAIL_DOMAIN);
  const domain = domainMatch?.[1] ? domainMatch[1] : "";

  for (const allowed of ALLOWLIST_DOMAINS) {
    if (domain.includes(allowed)) {
      return { isSpam: false };
    }
  }

  for (const spamDomain of SPAM_DOMAINS) {
    if (domain.includes(spamDomain)) {
      return { isSpam: true, reason: `spam_domain:${spamDomain}` };
    }
  }

  for (const pattern of SPAM_SENDER_PATTERNS) {
    if (pattern.test(email)) {
      return { isSpam: true, reason: `sender_pattern:${pattern.source}` };
    }
  }

  if (email.includes("noreply@") || email.includes("no-reply@")) {
    for (const spamNoreply of SPAM_NOREPLY_DOMAINS) {
      if (domain.includes(spamNoreply)) {
        return { isSpam: true, reason: `spam_noreply:${spamNoreply}` };
      }
    }
  }

  for (const pattern of SPAM_SUBJECT_PATTERNS) {
    if (pattern.test(subj)) {
      return { isSpam: true, reason: `subject_pattern:${pattern.source}` };
    }
  }

  return { isSpam: false };
}
