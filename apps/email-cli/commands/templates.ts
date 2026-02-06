/**
 * Email template commands: templates, template, send-template.
 */
import { parseArgs } from "node:util";
import {
  DEFAULT_USER,
  getUserClient,
  TEMPLATE_TEST_DATA,
} from "@email/commands/config";
import { loadFileAttachments } from "@email/commands/helpers";
import type { CommandHandler } from "@email/commands/types";
import {
  getLogoAttachment,
  getTemplate,
  listTemplates,
} from "@email/email-templates/index";

async function templatesCommand() {
  const templates = await listTemplates();
  console.log("Available email templates:\n");
  for (const template of templates.sort()) {
    const hasTestData = template in TEMPLATE_TEST_DATA;
    console.log(`  ${template}${hasTestData ? " (has test data)" : ""}`);
  }
  console.log("\nUsage: bun apps/email-cli/cli.ts template <name>");
}

async function templateCommand(templateName: string) {
  const testData = TEMPLATE_TEST_DATA[templateName];
  if (!testData) {
    console.error(`No test data for template: ${templateName}`);
    console.log("\nTemplates with test data:");
    for (const name of Object.keys(TEMPLATE_TEST_DATA)) {
      console.log(`  - ${name}`);
    }
    return;
  }

  console.log(`Generating ${templateName} template...`);
  const html = await getTemplate(templateName, testData);
  const logo = await getLogoAttachment();

  const client = await getUserClient();
  const subject = `[TEST] ${templateName} - ${testData.projectName || "Test"}`;

  console.log(`Sending test email: "${subject}"`);
  console.log(`To: ${DEFAULT_USER}`);

  await client.sendEmail({
    to: [{ email: DEFAULT_USER }],
    subject,
    body: html,
    bodyType: "html",
    attachments: [logo],
    skipSignature: true,
  });

  console.log("\nDone - Test email sent!");
}

async function sendTemplateCommand(options: {
  templateName: string;
  to: string;
  cc?: string;
  subject: string;
  vars: string;
  attachmentPaths?: string;
}) {
  let templateVars: Record<string, string | number>;
  try {
    templateVars = JSON.parse(options.vars);
  } catch {
    console.error("Error: Invalid JSON in --vars parameter");
    console.error(
      'Example: --vars \'{"recipientName":"John","projectName":"Test"}\''
    );
    process.exit(1);
  }

  console.log(`Loading template: ${options.templateName}`);
  const html = await getTemplate(options.templateName, templateVars);
  const logo = await getLogoAttachment();

  const toRecipients = options.to
    .split(",")
    .map((email) => ({ email: email.trim() }));
  const ccRecipients = options.cc
    ? options.cc.split(",").map((email) => ({ email: email.trim() }))
    : undefined;

  const attachments: Array<{
    name: string;
    contentType: string;
    contentBytes: string;
    contentId?: string;
    isInline?: boolean;
  }> = [logo];

  if (options.attachmentPaths) {
    const fileAtts = await loadFileAttachments(options.attachmentPaths);
    attachments.push(...fileAtts);
  }

  const client = await getUserClient();

  console.log(`Sending email: "${options.subject}"`);
  console.log(`To: ${options.to}`);
  if (options.cc) {
    console.log(`Cc: ${options.cc}`);
  }

  await client.sendEmail({
    to: toRecipients,
    cc: ccRecipients,
    subject: options.subject,
    body: html,
    bodyType: "html",
    attachments,
    skipSignature: true,
  });

  console.log("\nDone - Email sent!");
}

export const templateHandlers: Record<string, CommandHandler> = {
  templates: async (_args) => {
    await templatesCommand();
  },

  template: async (args) => {
    const templateName = args[0];
    if (!templateName) {
      console.error("Error: Template name required. Usage: template <name>");
      console.error("Run 'templates' to see available templates.");
      process.exit(1);
    }
    await templateCommand(templateName);
  },

  "send-template": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        to: { type: "string" },
        cc: { type: "string" },
        subject: { type: "string", short: "s" },
        vars: { type: "string", short: "v" },
        attachments: { type: "string", short: "a" },
      },
      allowPositionals: true,
    });
    const templateName = positionals[0];
    if (!(templateName && values.to && values.subject && values.vars)) {
      console.error(
        "Error: Template name, --to, --subject, and --vars are required"
      );
      console.error(
        "Usage: send-template <template> --to <email> --subject <text> --vars <json>"
      );
      console.error(
        '\nExample: send-template dust-permit-issued --to "user@example.com" \\'
      );
      console.error('  --subject "Dust Permit Issued - Project X" \\');
      console.error(
        '  --vars \'{"recipientName":"John","projectName":"Project X",...}\''
      );
      console.error("\nRun 'templates' to see available templates.");
      process.exit(1);
    }
    await sendTemplateCommand({
      templateName,
      to: values.to,
      cc: values.cc,
      subject: values.subject,
      vars: values.vars,
      attachmentPaths: values.attachments,
    });
  },
};
