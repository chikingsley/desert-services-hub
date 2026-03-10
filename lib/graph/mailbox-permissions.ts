export const WRITABLE_MAILBOXES = [
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
] as const;

export type WritableMailbox = (typeof WRITABLE_MAILBOXES)[number];
