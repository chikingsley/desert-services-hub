/**
 * Create rule functionality
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import type { MCPResponse } from "@outlook/auth/tools";
import {
  formatWritableMailboxes,
  isWritableMailbox,
} from "@outlook/config/mailbox-permissions";
import { getFolderIdByName } from "@outlook/email/folder-utils";
import { getInboxRules } from "@outlook/rules/list";
import { callGraphAPI } from "@outlook/utils/graph-api";

export interface CreateRuleArgs {
  containsSubject?: string;
  fromAddresses?: string;
  hasAttachments?: boolean;
  isEnabled?: boolean;
  mailbox?: string;
  markAsRead?: boolean;
  moveToFolder?: string;
  name: string;
  sequence?: number;
}

export interface CreateRuleResult {
  error?: boolean;
  message: string;
  ruleId?: string;
  success: boolean;
}

/**
 * Create rule handler
 */
export async function handleCreateRule(
  args: CreateRuleArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const {
    name,
    fromAddresses,
    containsSubject,
    hasAttachments,
    moveToFolder,
    markAsRead,
    isEnabled = true,
    sequence,
  } = args;

  if (sequence !== undefined && (Number.isNaN(sequence) || sequence < 1)) {
    return {
      content: [
        {
          type: "text",
          text: "Sequence must be a positive number greater than zero.",
        },
      ],
      isError: true,
    };
  }

  if (!name) {
    return {
      content: [
        {
          type: "text",
          text: "Rule name is required.",
        },
      ],
      isError: true,
    };
  }

  const hasCondition =
    fromAddresses || containsSubject || hasAttachments === true;
  const hasAction = moveToFolder || markAsRead === true;

  if (!hasCondition) {
    return {
      content: [
        {
          type: "text",
          text: "At least one condition is required. Specify fromAddresses, containsSubject, or hasAttachments.",
        },
      ],
      isError: true,
    };
  }

  if (!hasAction) {
    return {
      content: [
        {
          type: "text",
          text: "At least one action is required. Specify moveToFolder or markAsRead.",
        },
      ],
      isError: true,
    };
  }

  // Check if the mailbox has permission to modify
  if (!isWritableMailbox(mailbox)) {
    return {
      content: [
        {
          type: "text",
          text: `Creating rules is not allowed from this mailbox. Allowed: ${formatWritableMailboxes()}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const accessToken = await ensureAuthenticated();

    const result = await createInboxRule(accessToken, mailbox, {
      name,
      fromAddresses,
      containsSubject,
      hasAttachments,
      moveToFolder,
      markAsRead,
      isEnabled,
      sequence,
    });

    let responseText = result.message;

    if (!(sequence || result.error)) {
      responseText +=
        "\n\nTip: You can specify a 'sequence' parameter when creating rules to control their execution order. Lower sequence numbers run first.";
    }

    return {
      content: [
        {
          type: "text",
          text: responseText,
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
          text: `Error creating rule: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Create a new inbox rule
 */
async function createInboxRule(
  accessToken: string,
  mailbox: string,
  ruleOptions: Omit<CreateRuleArgs, "mailbox">
): Promise<CreateRuleResult> {
  try {
    const {
      name,
      fromAddresses,
      containsSubject,
      hasAttachments,
      moveToFolder,
      markAsRead,
      isEnabled,
      sequence,
    } = ruleOptions;

    let ruleSequence = sequence;
    if (!ruleSequence) {
      try {
        ruleSequence = 100;

        const existingRules = await getInboxRules(accessToken, mailbox);
        if (existingRules?.length > 0) {
          const highestSequence = Math.max(
            ...existingRules.map((r) => r.sequence || 0)
          );
          ruleSequence = Math.max(highestSequence + 1, 100);
          console.error(
            `Auto-generated sequence: ${ruleSequence} (based on highest existing: ${highestSequence})`
          );
        }
      } catch (sequenceError) {
        console.error(
          `Error determining rule sequence: ${(sequenceError as Error).message}`
        );
        ruleSequence = 100;
      }
    }

    console.error(`Using rule sequence: ${ruleSequence}`);
    ruleSequence = Math.max(1, Math.floor(ruleSequence));

    const rule: {
      displayName: string;
      isEnabled: boolean;
      sequence: number;
      conditions: Record<string, unknown>;
      actions: Record<string, unknown>;
    } = {
      displayName: name,
      isEnabled: isEnabled === true,
      sequence: ruleSequence,
      conditions: {},
      actions: {},
    };

    if (fromAddresses) {
      const emailAddresses = fromAddresses
        .split(",")
        .map((email) => email.trim())
        .filter((email) => email)
        .map((email) => ({
          emailAddress: {
            address: email,
          },
        }));

      if (emailAddresses.length > 0) {
        rule.conditions.fromAddresses = emailAddresses;
      }
    }

    if (containsSubject) {
      rule.conditions.subjectContains = [containsSubject];
    }

    if (hasAttachments === true) {
      rule.conditions.hasAttachment = true;
    }

    if (moveToFolder) {
      try {
        const folderId = await getFolderIdByName(
          accessToken,
          moveToFolder,
          mailbox
        );
        if (!folderId) {
          return {
            success: false,
            message: `Target folder "${moveToFolder}" not found. Please specify a valid folder name.`,
          };
        }

        rule.actions.moveToFolder = folderId;
      } catch (folderError) {
        console.error(
          `Error resolving folder "${moveToFolder}": ${(folderError as Error).message}`
        );
        return {
          success: false,
          message: `Error resolving folder "${moveToFolder}": ${(folderError as Error).message}`,
        };
      }
    }

    if (markAsRead === true) {
      rule.actions.markAsRead = true;
    }

    const response = await callGraphAPI<{ id: string; displayName: string }>(
      accessToken,
      "POST",
      `users/${mailbox}/mailFolders/inbox/messageRules`,
      rule
    );

    if (response?.id) {
      return {
        success: true,
        message: `Successfully created rule "${name}" with sequence ${ruleSequence}.`,
        ruleId: response.id,
      };
    }
    return {
      success: false,
      message: "Failed to create rule. The server didn't return a rule ID.",
    };
  } catch (error) {
    console.error(`Error creating rule: ${(error as Error).message}`);
    throw error;
  }
}

export default handleCreateRule;
