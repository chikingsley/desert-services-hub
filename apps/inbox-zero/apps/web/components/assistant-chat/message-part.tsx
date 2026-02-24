"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import type { ThreadLookup } from "@/components/assistant-chat/tools";
import {
  AddToKnowledgeBase,
  BasicToolInfo,
  CreatedRuleToolCard,
  ManageInboxResult,
  SearchInboxResult,
  UpdateAbout,
  UpdatedLearnedPatterns,
  UpdatedRuleActions,
  UpdatedRuleConditions,
} from "@/components/assistant-chat/tools";
import type { ChatMessage } from "@/components/assistant-chat/types";

interface MessagePartProps {
  isStreaming: boolean;
  messageId: string;
  part: ChatMessage["parts"][0];
  partIndex: number;
  threadLookup: ThreadLookup;
}

function ErrorToolCard({ error }: { error: string }) {
  return <div className="rounded border p-2 text-red-500">Error: {error}</div>;
}

function isOutputWithError(output: unknown): output is { error: unknown } {
  return typeof output === "object" && output !== null && "error" in output;
}

function getOutputField<T>(output: unknown, field: string): T | undefined {
  if (typeof output === "object" && output !== null && field in output) {
    return (output as Record<string, unknown>)[field] as T;
  }
  return undefined;
}

export function MessagePart({
  part,
  isStreaming,
  messageId,
  partIndex,
  threadLookup,
}: MessagePartProps) {
  const key = `${messageId}-${partIndex}`;

  if (part.type === "reasoning") {
    // Skip rendering if reasoning is redacted (limited token output from provider)
    if (!part.text || part.text === "[REDACTED]") {
      return null;
    }
    return (
      <Reasoning className="w-full" isStreaming={isStreaming} key={key}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "text") {
    if (!part.text) {
      return null;
    }
    return <Response key={key}>{part.text}</Response>;
  }

  // Tool handling
  if (part.type === "tool-getAccountOverview") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Loading account overview..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return <BasicToolInfo key={toolCallId} text="Loaded account overview" />;
    }
  }

  if (part.type === "tool-searchInbox") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Searching inbox..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return <SearchInboxResult key={toolCallId} output={output} />;
    }
  }

  if (part.type === "tool-readEmail") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Reading email..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      const subject = getOutputField<string>(output, "subject");
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Read email${subject ? `: ${subject}` : ""}`}
        />
      );
    }
  }

  if (part.type === "tool-manageInbox") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      if (
        part.input.action === "bulk_archive_senders" &&
        part.input.fromEmails?.length
      ) {
        return (
          <ManageInboxResult
            input={part.input}
            isInProgress
            key={toolCallId}
            output={getInProgressManageInboxOutput(part.input)}
            threadLookup={threadLookup}
          />
        );
      }

      let actionText = "Updating emails...";
      if (part.input.action === "archive_threads") {
        actionText = part.input.labelId
          ? "Archiving and labeling emails..."
          : "Archiving emails...";
      } else if (part.input.action === "mark_read_threads") {
        actionText =
          part.input.read === false
            ? "Marking emails as unread..."
            : "Marking emails as read...";
      }

      return <BasicToolInfo key={toolCallId} text={actionText} />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return (
        <ManageInboxResult
          input={part.input}
          key={toolCallId}
          output={output}
          threadIds={
            part.input.action !== "bulk_archive_senders"
              ? part.input.threadIds
              : undefined
          }
          threadLookup={threadLookup}
        />
      );
    }
  }

  if (part.type === "tool-updateInboxFeatures") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Updating inbox features..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return <BasicToolInfo key={toolCallId} text="Updated inbox features" />;
    }
  }

  if (part.type === "tool-sendEmail") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Sending email..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      const to = getOutputField<string>(output, "to");
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Sent email${to ? ` to ${to}` : ""}`}
        />
      );
    }
  }

  if (part.type === "tool-forwardEmail") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Forwarding email..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      const to = getOutputField<string>(output, "to");
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Forwarded email${to ? ` to ${to}` : ""}`}
        />
      );
    }
  }

  if (part.type === "tool-getUserRulesAndSettings") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Reading rules and settings..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return <BasicToolInfo key={toolCallId} text="Read rules and settings" />;
    }
  }

  if (part.type === "tool-getLearnedPatterns") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Reading learned patterns..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return <BasicToolInfo key={toolCallId} text="Read learned patterns" />;
    }
  }

  if (part.type === "tool-createRule") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Creating rule "${part.input.name}"...`}
        />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      return (
        <CreatedRuleToolCard
          args={part.input}
          key={toolCallId}
          ruleId={ruleId}
        />
      );
    }
  }

  if (part.type === "tool-updateRuleConditions") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Updating rule "${part.input.ruleName}" conditions...`}
        />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId) {
        return (
          <ErrorToolCard error="Missing rule ID in response" key={toolCallId} />
        );
      }
      return (
        <UpdatedRuleConditions
          args={part.input}
          key={toolCallId}
          originalConditions={getOutputField(output, "originalConditions")}
          ruleId={ruleId}
          updatedConditions={getOutputField(output, "updatedConditions")}
        />
      );
    }
  }

  if (part.type === "tool-updateRuleActions") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Updating rule "${part.input.ruleName}" actions...`}
        />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId) {
        return (
          <ErrorToolCard error="Missing rule ID in response" key={toolCallId} />
        );
      }
      return (
        <UpdatedRuleActions
          args={part.input}
          key={toolCallId}
          originalActions={getOutputField(output, "originalActions")}
          ruleId={ruleId}
          updatedActions={getOutputField(output, "updatedActions")}
        />
      );
    }
  }

  if (part.type === "tool-updateLearnedPatterns") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo
          key={toolCallId}
          text={`Updating learned patterns for rule "${part.input.ruleName}"...`}
        />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      const ruleId = getOutputField<string>(output, "ruleId");
      if (!ruleId) {
        return (
          <ErrorToolCard error="Missing rule ID in response" key={toolCallId} />
        );
      }
      return (
        <UpdatedLearnedPatterns
          args={part.input}
          key={toolCallId}
          ruleId={ruleId}
        />
      );
    }
  }

  if (part.type === "tool-updateAbout") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Updating about..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return <UpdateAbout args={part.input} key={toolCallId} />;
    }
  }

  if (part.type === "tool-addToKnowledgeBase") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (
        <BasicToolInfo key={toolCallId} text="Adding to knowledge base..." />
      );
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return <AddToKnowledgeBase args={part.input} key={toolCallId} />;
    }
  }

  if (part.type === "tool-saveMemory") {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return <BasicToolInfo key={toolCallId} text="Saving memory..." />;
    }
    if (state === "output-available") {
      const { output } = part;
      if (isOutputWithError(output)) {
        return <ErrorToolCard error={String(output.error)} key={toolCallId} />;
      }
      return <BasicToolInfo key={toolCallId} text="Memory saved" />;
    }
  }

  return null;
}

function getInProgressManageInboxOutput(input: {
  action: string;
  fromEmails?: string[];
}) {
  return {
    action: input.action,
    senders: input.fromEmails ?? [],
    sendersCount: input.fromEmails?.length ?? 0,
  };
}
