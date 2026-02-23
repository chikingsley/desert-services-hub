/**
 * List rules functionality
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import type { MCPResponse } from "@outlook/auth/tools";
import { callGraphAPI } from "@outlook/utils/graph-api";

export interface EmailAddress {
  address: string;
  name?: string;
}

export interface RuleRecipient {
  emailAddress: EmailAddress;
}

export interface RuleConditions {
  bodyContains?: string[];
  fromAddresses?: RuleRecipient[];
  hasAttachment?: boolean;
  importance?: string;
  subjectContains?: string[];
}

export interface RuleActions {
  copyToFolder?: string;
  delete?: boolean;
  forwardTo?: RuleRecipient[];
  markAsRead?: boolean;
  markImportance?: string;
  moveToFolder?: string;
}

export interface InboxRule {
  actions?: RuleActions;
  conditions?: RuleConditions;
  displayName: string;
  id: string;
  isEnabled: boolean;
  sequence?: number;
}

export interface ListRulesArgs {
  includeDetails?: boolean;
  mailbox?: string;
}

/**
 * List rules handler
 */
export async function handleListRules(
  args: ListRulesArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const includeDetails = args.includeDetails === true;

  try {
    const accessToken = await ensureAuthenticated();
    const rules = await getInboxRules(accessToken, mailbox);
    const formattedRules = formatRulesList(rules, includeDetails);

    return {
      content: [
        {
          type: "text",
          text: formattedRules,
        },
      ],
    };
  } catch (error) {
    if ((error as Error).message === "Authentication required") {
      return {
        content: [
          {
            type: "text",
            text: "Authentication required. Please use the 'authenticate' tool first.",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Error listing rules: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Get all inbox rules
 */
export async function getInboxRules(
  accessToken: string,
  mailbox: string
): Promise<InboxRule[]> {
  try {
    interface RulesListResponse {
      value: InboxRule[];
    }

    const response = await callGraphAPI<RulesListResponse>(
      accessToken,
      "GET",
      `users/${mailbox}/mailFolders/inbox/messageRules`,
      null
    );

    return response.value || [];
  } catch (error) {
    console.error(`Error getting inbox rules: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Format rules list for display
 */
function formatRulesList(rules: InboxRule[], includeDetails: boolean): string {
  if (!rules || rules.length === 0) {
    return "No inbox rules found.\n\nTip: You can create rules using the 'create-rule' tool. Rules are processed in order of their sequence number (lower numbers are processed first).";
  }

  const sortedRules = [...rules].sort((a, b) => {
    return (a.sequence || 9999) - (b.sequence || 9999);
  });

  if (includeDetails) {
    const detailedRules = sortedRules.map((rule, index) => {
      let ruleText = `${index + 1}. ${rule.displayName}${rule.isEnabled ? "" : " (Disabled)"} - Sequence: ${rule.sequence || "N/A"}`;

      const conditions = formatRuleConditions(rule);
      if (conditions) {
        ruleText += `\n   Conditions: ${conditions}`;
      }

      const actions = formatRuleActions(rule);
      if (actions) {
        ruleText += `\n   Actions: ${actions}`;
      }

      return ruleText;
    });

    return `Found ${rules.length} inbox rules (sorted by execution order):\n\n${detailedRules.join("\n\n")}\n\nRules are processed in order of their sequence number. You can change rule order using the 'edit-rule-sequence' tool.`;
  }
  const simpleRules = sortedRules.map((rule, index) => {
    return `${index + 1}. ${rule.displayName}${rule.isEnabled ? "" : " (Disabled)"} - Sequence: ${rule.sequence || "N/A"}`;
  });

  return `Found ${rules.length} inbox rules (sorted by execution order):\n\n${simpleRules.join("\n")}\n\nTip: Use 'list-rules with includeDetails=true' to see more information about each rule.`;
}

/**
 * Format rule conditions for display
 */
function formatRuleConditions(rule: InboxRule): string {
  const conditions: string[] = [];

  if (
    rule.conditions?.fromAddresses &&
    rule.conditions.fromAddresses.length > 0
  ) {
    const senders = rule.conditions.fromAddresses
      .map((addr) => addr.emailAddress.address)
      .join(", ");
    conditions.push(`From: ${senders}`);
  }

  if (
    rule.conditions?.subjectContains &&
    rule.conditions.subjectContains.length > 0
  ) {
    conditions.push(
      `Subject contains: "${rule.conditions.subjectContains.join(", ")}"`
    );
  }

  if (
    rule.conditions?.bodyContains &&
    rule.conditions.bodyContains.length > 0
  ) {
    conditions.push(
      `Body contains: "${rule.conditions.bodyContains.join(", ")}"`
    );
  }

  if (rule.conditions?.hasAttachment === true) {
    conditions.push("Has attachment");
  }

  if (rule.conditions?.importance) {
    conditions.push(`Importance: ${rule.conditions.importance}`);
  }

  return conditions.join("; ");
}

/**
 * Format rule actions for display
 */
function formatRuleActions(rule: InboxRule): string {
  const actions: string[] = [];

  if (rule.actions?.moveToFolder) {
    actions.push(`Move to folder: ${rule.actions.moveToFolder}`);
  }

  if (rule.actions?.copyToFolder) {
    actions.push(`Copy to folder: ${rule.actions.copyToFolder}`);
  }

  if (rule.actions?.markAsRead === true) {
    actions.push("Mark as read");
  }

  if (rule.actions?.markImportance) {
    actions.push(`Mark importance: ${rule.actions.markImportance}`);
  }

  if (rule.actions?.forwardTo && rule.actions.forwardTo.length > 0) {
    const recipients = rule.actions.forwardTo
      .map((r) => r.emailAddress.address)
      .join(", ");
    actions.push(`Forward to: ${recipients}`);
  }

  if (rule.actions?.delete === true) {
    actions.push("Delete");
  }

  return actions.join("; ");
}

export { handleListRules as default };
