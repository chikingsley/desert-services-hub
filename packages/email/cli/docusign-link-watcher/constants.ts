export const CONTRACTS_MAILBOX = "contracts@desertservices.net";
export const DOCUSIGN_SENDER = "docusign.net";
export const TRIGGER_PHRASE = "requested new link";
export const DEFAULT_HOURS_BACK = 24;
export const DEFAULT_POLL_INTERVAL_SEC = 30;
export const MAX_POLL_ATTEMPTS = 60;
export const DOCUSIGN_LINK_PATTERN =
  /https:\/\/na\d+\.docusign\.net\/Signing\/EmailStart\.aspx\?[^\s"<]+/gi;
export const SECURITY_CODE_PATTERN =
  /security code:\s*(?:<br\s*\/?>)?\s*([A-F0-9]{30,})/i;
export const DOCUSIGN_LINK_WINDOW_MS = 30 * 60 * 1000;
export const SEARCH_MAILBOXES = [
  "jeff@desertservices.net",
  "jared@desertservices.net",
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "denise@desertservices.net",
  "lacie@desertservices.net",
] as const;
export const RE_DOCUSIGN_SENDER =
  /(?:from|sent by)[:\s]+([^<\n]+?)(?:\s*(?:via|<|sent))/i;
export const RE_DOCUSIGN_RECIPIENT =
  /(?:<b>Sent:<\/b>|Sent:).*?(?:<b>To:<\/b>|To:)\s*([^<\n]+)/is;
export const RE_DOCUSIGN_SUBJECT =
  /(?:<b>Subject:<\/b>|Subject:)\s*(?:<\/?\w[^>]*>)*\s*([^\n<]+)/i;
export const RE_WHITESPACE_SPLIT = /\s+/;
export const RE_AMPERSAND = /&amp;/g;
export const RE_TRAILING_QUOTE = /"$/;
export const RE_TRAILING_SINGLE_QUOTE = /'$/;
export const RE_REPLY_PREFIX = /^(?:Re|Fw|FW|Fwd):\s*/gi;
