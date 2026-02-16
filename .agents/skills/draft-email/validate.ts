/**
 * Email Draft Validator
 *
 * Checks drafted email HTML against Chi's voice profile rules.
 * Run directly: bun .claude/skills/draft-email/validate.ts <file-or-stdin>
 * Import: import { validateDraft } from './validate'
 */

type Severity = "error" | "warning";

interface Issue {
  severity: Severity;
  rule: string;
  message: string;
  match?: string;
}

const FORBIDDEN_PHRASES = [
  "hope this finds you well",
  "just wanted to reach out",
  "per our previous conversation",
  "as per our discussion",
  "i wanted to follow up",
  "please do not hesitate",
  "feel free to",
  "at your earliest convenience",
  "kindly",
  "best regards",
  "warm regards",
  "sincerely",
  "looking forward to hearing from you",
  "touch base",
  "circle back",
  "loop in",
  "apologies for the delay",
] as const;

const FORBIDDEN_HTML = [
  { pattern: /<p[\s>]/i, name: "<p> tag", fix: "Use <div> instead" },
  { pattern: /<strong[\s>]/i, name: "<strong> tag", fix: "Use <b> instead" },
  { pattern: /<em[\s>]/i, name: "<em> tag", fix: "Chi doesn't use italics" },
  { pattern: /<i[\s>]/i, name: "<i> tag", fix: "Chi doesn't use italics" },
  {
    pattern: /<table[\s>]/i,
    name: "<table> tag",
    fix: "Never use tables in emails",
  },
  {
    pattern: /<span[^>]*style/i,
    name: "<span> with inline style",
    fix: "Use <b> for bold, plain text for everything else",
  },
] as const;

const SIGNATURE_FRAGMENTS = [
  "chi ejimofor",
  "project coordinator",
  "chi@desertservices.net",
  "(304) 405-2446",
  'src="cid:logo"',
] as const;

const MAX_BODY_LINES = 20;
const WARN_BODY_LINES = 12;

// Top-level regex patterns for performance
const CLOSING_PATTERNS = [
  /thanks,\s*<\/div>/i,
  /thank you,\s*<\/div>/i,
  /regards,\s*<\/div>/i,
] as const;

const UL_NO_MARGIN_PATTERN = /<ul(?![^>]*margin)/i;
const UL_PATTERN = /<ul/i;
const UL_EXTRACT_PATTERN = /<ul[^>]*>/i;
const LI_PATTERN = /<li>/i;
const LI_DIV_PATTERN = /<li>\s*<div>/i;
const FIRST_DIV_PATTERN = /<div>([^<]+)<\/div>/;
const GREETING_NEXT_PATTERN = /<div>[^<]+,<\/div>\s*(<[^>]+>)/;
const DEAR_OPENING_PATTERN = /^<div>\s*dear\s/i;

export function validateDraft(html: string): Issue[] {
  const issues: Issue[] = [];
  const textContent = html.replace(/<[^>]+>/g, " ").toLowerCase();

  // Check forbidden phrases
  for (const phrase of FORBIDDEN_PHRASES) {
    if (textContent.includes(phrase)) {
      issues.push({
        severity: "error",
        rule: "forbidden-phrase",
        message: `Contains forbidden phrase: "${phrase}"`,
        match: phrase,
      });
    }
  }

  // Check wrong closing
  for (const pattern of CLOSING_PATTERNS) {
    if (pattern.test(html)) {
      issues.push({
        severity: "error",
        rule: "wrong-closing",
        message:
          'Wrong closing detected. Chi always uses "Best," — never "Thanks," or "Regards,"',
        match: html.match(pattern)?.[0],
      });
    }
  }

  // Check forbidden HTML elements
  for (const { pattern, name, fix } of FORBIDDEN_HTML) {
    if (pattern.test(html)) {
      issues.push({
        severity: "error",
        rule: "forbidden-html",
        message: `${name} found. ${fix}`,
        match: name,
      });
    }
  }

  // Check signature leaked into body
  for (const fragment of SIGNATURE_FRAGMENTS) {
    if (textContent.includes(fragment)) {
      issues.push({
        severity: "warning",
        rule: "signature-in-body",
        message: `Signature fragment found in body: "${fragment}". The signature is appended by wrapWithSignature() — don't include it in the draft.`,
        match: fragment,
      });
    }
  }

  // Check <ul> has margin reset
  if (UL_NO_MARGIN_PATTERN.test(html) && UL_PATTERN.test(html)) {
    const ulMatch = html.match(UL_EXTRACT_PATTERN)?.[0] ?? "";
    if (!ulMatch.includes("margin-top:0")) {
      issues.push({
        severity: "warning",
        rule: "ul-margin-reset",
        message:
          '<ul> missing margin reset. Use: <ul style="margin-top:0; margin-bottom:0">',
      });
    }
  }

  // Check list items wrapped in div
  if (LI_PATTERN.test(html) && !LI_DIV_PATTERN.test(html)) {
    issues.push({
      severity: "warning",
      rule: "li-needs-div",
      message:
        "<li> content should be wrapped in <div>: <li><div>...</div></li>",
    });
  }

  // Check line count (content lines, not HTML wrapper lines)
  const contentDivs = html.match(/<div>[^<]+<\/div>/g) ?? [];
  const nonEmptyLines = contentDivs.filter((line) => {
    const text = line.replace(/<[^>]+>/g, "").trim();
    return text.length > 0 && text !== "Best,";
  });

  if (nonEmptyLines.length > MAX_BODY_LINES) {
    issues.push({
      severity: "error",
      rule: "too-long",
      message: `Body has ${nonEmptyLines.length} content lines (max ${MAX_BODY_LINES}). Chi's emails are typically 3-8 lines.`,
    });
  } else if (nonEmptyLines.length > WARN_BODY_LINES) {
    issues.push({
      severity: "warning",
      rule: "long-email",
      message: `Body has ${nonEmptyLines.length} content lines (warn at ${WARN_BODY_LINES}). Consider trimming.`,
    });
  }

  // Check greeting format
  const firstDiv = html.match(FIRST_DIV_PATTERN)?.[1]?.trim() ?? "";
  if (firstDiv && !firstDiv.endsWith(",")) {
    issues.push({
      severity: "warning",
      rule: "greeting-format",
      message: `First line "${firstDiv}" doesn't end with a comma. Expected format: "Name,"`,
    });
  }

  // Check blank line after greeting
  const greetingAndNext = html.match(GREETING_NEXT_PATTERN)?.[1];
  if (greetingAndNext && !greetingAndNext.includes("<br>")) {
    issues.push({
      severity: "warning",
      rule: "spacing-after-greeting",
      message:
        "Missing blank line after greeting. Expected <div><br></div> after name.",
    });
  }

  // Check "Dear" opening
  if (DEAR_OPENING_PATTERN.test(html)) {
    issues.push({
      severity: "error",
      rule: "no-dear",
      message: 'Never open with "Dear". Use first name + comma.',
    });
  }

  return issues;
}

function formatIssues(issues: Issue[]): string {
  if (issues.length === 0) {
    return "PASS — No issues found.";
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  const lines: string[] = [];

  if (errors.length > 0) {
    lines.push(
      `FAIL — ${errors.length} error(s), ${warnings.length} warning(s)\n`
    );
  } else {
    lines.push(`WARN — ${warnings.length} warning(s)\n`);
  }

  for (const issue of issues) {
    const icon = issue.severity === "error" ? "x" : "!";
    lines.push(`  [${icon}] ${issue.rule}: ${issue.message}`);
  }

  return lines.join("\n");
}

// CLI entrypoint
if (import.meta.main) {
  const input = Bun.argv[2];

  let html: string;
  if (input && input !== "-") {
    const file = Bun.file(input);
    if (!(await file.exists())) {
      console.error(`File not found: ${input}`);
      process.exit(1);
    }
    html = await file.text();
  } else {
    // Read from stdin
    const chunks: string[] = [];
    const reader = Bun.stdin.stream().getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(decoder.decode(value));
    }
    html = chunks.join("");
  }

  const issues = validateDraft(html);
  console.log(formatIssues(issues));
  process.exit(issues.some((i) => i.severity === "error") ? 1 : 0);
}
