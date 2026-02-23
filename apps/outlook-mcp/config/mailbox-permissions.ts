/**
 * Mailbox permission configuration
 *
 * Controls which mailboxes can perform write operations (send, delete, archive, draft, etc.)
 * All other mailboxes are read-only.
 */

const WRITABLE_MAILBOXES = [
  "contracts@desertservices.net",
  "chi@desertservices.net",
  "dustpermits@desertservices.net",
];

/**
 * Check if a mailbox can perform write operations (send, modify, delete, draft, etc.)
 */
export function isWritableMailbox(mailbox: string): boolean {
  return WRITABLE_MAILBOXES.some(
    (allowed) => allowed.toLowerCase() === mailbox.toLowerCase()
  );
}

/**
 * Format writable mailboxes for error messages
 */
export function formatWritableMailboxes(): string {
  return WRITABLE_MAILBOXES.map((email) => `${email.split("@")[0]}@`).join(
    ", "
  );
}
