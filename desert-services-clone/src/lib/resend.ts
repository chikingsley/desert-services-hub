import { Resend } from "resend";

export function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY env var.");
  }

  return new Resend(apiKey);
}

export function getResendAddresses() {
  const from = process.env.RESEND_FROM;
  const to = process.env.RESEND_TO;

  if (!from) {
    throw new Error("Missing RESEND_FROM env var.");
  }
  if (!to) {
    throw new Error("Missing RESEND_TO env var.");
  }

  return { from, to };
}
