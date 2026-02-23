/**
 * Spam Filter
 *
 * Filters out marketing, newsletter, and spam emails from sync.
 */

const SPAM_DOMAINS = [
  // Retail/marketing
  "emdeals.michaels.com",
  "em.michaelscustomframing.com",
  "send.michaels.com",
  "e-email.guns.com",
  "e-info.guns.com",
  "em.azcardinals.com",
  "campaign.eventbrite.com",
  "order.eventbrite.com",
  "event.eventbrite.com",
  // Newsletter platforms
  "e.shrm.org",
  "news.pitchbook.com",
  "rfg.realfinancialgain.com",
  "ccsend.com",
  "mail.beehiiv.com",
  "email.mg1.substack.com",
  "substack.com",
  "mailchimp.com",
  "sendgrid.net",
  "klaviyo.com",
  // Political spam
  "keyprofitstrategy.com",
  "restninvest.com",
  "stockexchangeinsiders.com",
  "rnchq.com",
  "profitpeakstrategy.com",
  "unshakeableconservatives.com",
  "historyoftheday.com",
  "stopdemocrats.net",
  "americanlibertyalert.com",
  "seal-pac.com",
  "winningrightpac.com",
  // Investment spam
  "thetrustnest.com",
  "mastersofthestockmarket.com",
  "safeinvestzone.com",
  "economicinsightreport.com",
  "insidetradingtalks.com",
  "opendealsreport.com",
  "theinvestormanifesto.com",
  "futuremoneyorbit.com",
  "shadowfinanceforce.com",
  "dividenddriveclub.com",
  "increasingnetworth.com",
  // Social/marketing/industry newsletters
  "nextdoor.com",
  "wastetodaymagazine.com",
  "fromyouflowers.com",
  // Retail/shopping marketing
  "myphotos.walmart.com",
  "anthropologie.com",
  // Recruiting spam
  "tradex-select.com",
  "roberthalf.com",
  // Apple marketing newsletter
  "insideapple.apple.com",
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
  "yardi.com",
  "desertservices.net",
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
  /verification code/i,
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

function extractSenderDomain(email: string): string {
  const domainMatch = email.match(RE_EMAIL_DOMAIN);
  return domainMatch?.[1] ?? "";
}

function matchesAllowedDomain(domain: string): boolean {
  return ALLOWLIST_DOMAINS.some((allowed) => domain.includes(allowed));
}

function matchedSpamDomain(domain: string): string | null {
  return SPAM_DOMAINS.find((spamDomain) => domain.includes(spamDomain)) ?? null;
}

function matchedSenderPattern(email: string): RegExp | null {
  return SPAM_SENDER_PATTERNS.find((pattern) => pattern.test(email)) ?? null;
}

function matchedSpamNoReplyDomain(
  email: string,
  domain: string
): string | null {
  const isNoReply = email.includes("noreply@") || email.includes("no-reply@");
  if (!isNoReply) {
    return null;
  }

  return (
    SPAM_NOREPLY_DOMAINS.find((spamNoReply) => domain.includes(spamNoReply)) ??
    null
  );
}

function matchedSubjectPattern(subject: string): RegExp | null {
  return SPAM_SUBJECT_PATTERNS.find((pattern) => pattern.test(subject)) ?? null;
}

export function isSpam(
  fromEmail: string | null | undefined,
  subject: string | null | undefined
): SpamCheckResult {
  if (!fromEmail) {
    return { isSpam: true, reason: "no_sender" };
  }

  const email = fromEmail.toLowerCase();
  const subj = subject?.toLowerCase() || "";
  const domain = extractSenderDomain(email);

  if (matchesAllowedDomain(domain)) {
    return { isSpam: false };
  }

  const spamDomain = matchedSpamDomain(domain);
  if (spamDomain) {
    return { isSpam: true, reason: `spam_domain:${spamDomain}` };
  }

  const senderPattern = matchedSenderPattern(email);
  if (senderPattern) {
    return { isSpam: true, reason: `sender_pattern:${senderPattern.source}` };
  }

  const spamNoReplyDomain = matchedSpamNoReplyDomain(email, domain);
  if (spamNoReplyDomain) {
    return { isSpam: true, reason: `spam_noreply:${spamNoReplyDomain}` };
  }

  const subjectPattern = matchedSubjectPattern(subj);
  if (subjectPattern) {
    return { isSpam: true, reason: `subject_pattern:${subjectPattern.source}` };
  }

  return { isSpam: false };
}
