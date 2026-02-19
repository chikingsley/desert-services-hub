export type PlaywrightBodyLinkSource =
  | "egnyte"
  | "dropbox"
  | "buildingconnected";

export const PLAYWRIGHT_EGNYTE_CLICK_SELECTORS = [
  'button:has-text("Download Folder")',
  '[role="button"]:has-text("Download Folder")',
  'button:has-text("Download folder")',
  '[role="button"]:has-text("Download folder")',
  'button:has-text("Download")',
  '[role="button"]:has-text("Download")',
  'a:has-text("Download")',
  '[aria-label*="Download"]',
  '[title*="Download"]',
] as const;

export const PLAYWRIGHT_DROPBOX_PRIMARY_SELECTORS = [
  'button:has-text("Download")',
  '[role="button"]:has-text("Download")',
  'a:has-text("Download")',
  '[data-testid*="download"]',
] as const;

export const PLAYWRIGHT_DROPBOX_MENU_SELECTORS = [
  'button:has-text("Direct download")',
  '[role="menuitem"]:has-text("Direct download")',
  'button:has-text("Download as zip")',
  '[role="menuitem"]:has-text("Download as zip")',
  '[role="menuitem"]:has-text("Download")',
] as const;

export const PLAYWRIGHT_BUILDINGCONNECTED_PRIMARY_SELECTORS = [
  'button:has-text("Download folder")',
  '[role="button"]:has-text("Download folder")',
  'button:has-text("Download Folder")',
  '[role="button"]:has-text("Download Folder")',
  'button:has-text("Download")',
  '[role="button"]:has-text("Download")',
  'a:has-text("Download")',
  '[aria-label*="Download"]',
] as const;

export const PLAYWRIGHT_BUILDINGCONNECTED_MENU_SELECTORS = [
  'button:has-text("Download as zip")',
  '[role="menuitem"]:has-text("Download as zip")',
  'button:has-text("Download all files")',
  '[role="menuitem"]:has-text("Download all files")',
  'button:has-text("Download All")',
  '[role="menuitem"]:has-text("Download All")',
] as const;

export const PLAYWRIGHT_BUILDINGCONNECTED_LOGIN_LINK_SELECTORS = [
  'a:has-text("Already have an account?")',
  'button:has-text("Already have an account?")',
  "text=Already have an account?",
] as const;

export const PLAYWRIGHT_BUILDINGCONNECTED_EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[id*="email" i]',
] as const;

export const PLAYWRIGHT_BUILDINGCONNECTED_PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[id*="password" i]',
] as const;

export const PLAYWRIGHT_BUILDINGCONNECTED_SUBMIT_SELECTORS = [
  "#verify_user_btn",
  'button[id="verify_user_btn"]',
  'button[type="submit"]',
  'button:has-text("NEXT")',
  '[role="button"]:has-text("NEXT")',
  'button[aria-label*="NEXT" i]',
  'button:has-text("Sign in")',
  '[role="button"]:has-text("Sign in")',
  'button[aria-label*="Sign in" i]',
  'button:has-text("Log in")',
  '[role="button"]:has-text("Log in")',
  'button[aria-label*="Log in" i]',
  'button:has-text("Continue")',
  'button[aria-label*="Continue" i]',
  'button:has-text("Verify")',
  '[role="button"]:has-text("Verify")',
  'button[aria-label*="Verify" i]',
] as const;

export const PLAYWRIGHT_BUILDINGCONNECTED_OTP_SELECTORS = [
  'input[autocomplete="one-time-code"]',
  'input[name*="otp" i]',
  'input[id*="otp" i]',
  'input[name*="code" i]',
  'input[id*="code" i]',
] as const;
