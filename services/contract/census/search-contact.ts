#!/usr/bin/env bun
import type { Email } from "./db.ts";
/**
 * Search census database for contact information
 */
import { searchEmailsFullText } from "./db.ts";

const query = process.argv[2] || "";

if (!query) {
  console.error("Usage: bun search-contact.ts <name or phone>");
  process.exit(1);
}

console.log(`Searching for: "${query}"\n`);

// Search by name
const results = searchEmailsFullText(query, 100);

if (results.length === 0) {
  console.log("No results found.");
  process.exit(0);
}

console.log(`Found ${results.length} email(s):\n`);

// Extract contact information from emails
const contacts = new Map<
  string,
  {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    emails: Email[];
  }
>();

for (const email of results) {
  // Extract from email body
  const body = email.bodyFull || email.bodyPreview || "";

  // Try to extract phone numbers (various formats)
  const phonePatterns = [
    /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
    /\b\((\d{3})\)\s*(\d{3}[-.\s]?\d{4})\b/g,
    /\b(\d{10})\b/g,
  ];

  const phones: string[] = [];
  for (const pattern of phonePatterns) {
    const matches = body.matchAll(pattern);
    for (const match of matches) {
      const phone = match[0].replace(/\D/g, "");
      if (phone.length === 10 || phone.length === 11) {
        phones.push(phone);
      }
    }
  }

  // Extract email addresses
  const emailPattern = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
  const _emails = Array.from(body.matchAll(emailPattern)).map((m) => m[1]);

  // Try to find name near the query term
  const queryLower = query.toLowerCase();
  const bodyLower = body.toLowerCase();
  const queryIndex = bodyLower.indexOf(queryLower);

  let name = email.fromName || undefined;
  if (queryIndex !== -1) {
    // Try to extract name from context around the query
    const context = body.slice(Math.max(0, queryIndex - 100), queryIndex + 100);
    const nameMatch = context.match(
      /(?:^|\n|>)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Mark|Borelli)/i
    );
    if (nameMatch) {
      name = nameMatch[1].trim();
    }
  }

  // Create a key for grouping
  const key = email.fromEmail || email.id.toString();

  if (!contacts.has(key)) {
    contacts.set(key, {
      name: name || email.fromName || undefined,
      email: email.fromEmail || undefined,
      phone: phones[0],
      company: email.contractorName || undefined,
      emails: [],
    });
  }

  const contact = contacts.get(key);
  if (!contact) {
    throw new Error(`Contact ${key} should exist after set`);
  }
  contact.emails.push(email);

  // Update phone if found
  if (phones.length > 0 && !contact.phone) {
    contact.phone = phones[0];
  }

  // Update name if found
  if (name && !contact.name) {
    contact.name = name;
  }
}

// Display results
console.log("=== CONTACT INFORMATION ===\n");

for (const [_key, contact] of contacts.entries()) {
  console.log(`Name: ${contact.name || "N/A"}`);
  console.log(`Email: ${contact.email || "N/A"}`);
  console.log(`Phone: ${contact.phone || "N/A"}`);
  console.log(`Company: ${contact.company || "N/A"}`);
  console.log(`Found in ${contact.emails.length} email(s)`);
  console.log("\n--- Email Details ---");

  for (const email of contact.emails.slice(0, 3)) {
    console.log(`\nSubject: ${email.subject || "N/A"}`);
    console.log(`Date: ${email.receivedAt}`);
    console.log(`From: ${email.fromName} <${email.fromEmail}>`);
    if (email.bodyPreview) {
      const preview = email.bodyPreview.slice(0, 200).replace(/\n/g, " ");
      console.log(`Preview: ${preview}...`);
    }
  }

  console.log(`\n${"=".repeat(50)}\n`);
}

// Also search for phone number patterns if query looks like a phone number
const phoneOnly = query.replace(/\D/g, "");
if (phoneOnly.length >= 10) {
  console.log("\n=== SEARCHING BY PHONE NUMBER ===\n");

  const phoneResults = searchEmailsFullText(phoneOnly, 50);

  if (phoneResults.length > 0) {
    console.log(
      `Found ${phoneResults.length} email(s) containing phone number:\n`
    );

    for (const email of phoneResults.slice(0, 10)) {
      console.log(`Subject: ${email.subject || "N/A"}`);
      console.log(`From: ${email.fromName} <${email.fromEmail}>`);
      console.log(`Date: ${email.receivedAt}`);
      console.log(`Match in: ${email.matchSource}`);
      console.log("---");
    }
  }
}
