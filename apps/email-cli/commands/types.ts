/**
 * Shared types for email CLI command handlers.
 */
export type CommandHandler = (args: string[]) => Promise<void>;
