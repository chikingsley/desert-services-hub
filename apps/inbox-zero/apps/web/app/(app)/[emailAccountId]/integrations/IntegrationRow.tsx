"use client";

import clsx from "clsx";
import { ChevronDown, ChevronRight, MoreVertical } from "lucide-react";
import { useState } from "react";
import type { GetMcpAuthUrlResponse } from "@/app/api/mcp/[integration]/auth-url/route";
import type { GetIntegrationsResponse } from "@/app/api/mcp/integrations/route";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { Notice } from "@/components/Notice";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { MutedText, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  disconnectMcpConnectionAction,
  toggleMcpConnectionAction,
  toggleMcpToolAction,
} from "@/utils/actions/mcp";
import { fetchWithAccount } from "@/utils/fetch";
import { truncate } from "@/utils/string";
import { RequestAccessDialog } from "./RequestAccessDialog";

interface IntegrationRowProps {
  integration: GetIntegrationsResponse["integrations"][number];
  onConnectionChange: () => void;
}

export function IntegrationRow({
  integration,
  onConnectionChange,
}: IntegrationRowProps) {
  const { emailAccountId } = useAccount();
  const [disconnecting, setDisconnecting] = useState(false);
  const [expandedTools, setExpandedTools] = useState(false);

  const conn = integration.connection;

  const connected = !!conn;
  const isActive = conn?.isActive ?? false;
  const toolsCount = conn?.tools?.filter((t) => t.isEnabled).length || 0;
  const totalTools = conn?.tools?.length || 0;
  const connectionId = conn?.id;
  const tools = conn?.tools || [];

  const handleConnect = async () => {
    if (integration.authType === "api-token") {
      toastError({
        title: "Error connecting to integration",
        description: "API token connections are not supported yet",
      });
      return;
    }

    try {
      const response = await fetchWithAccount({
        url: `/api/mcp/${integration.name}/auth-url`,
        emailAccountId,
      });

      if (!response.ok) {
        throw new Error("Failed to get authorization URL");
      }

      const data: GetMcpAuthUrlResponse = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error(
        `Failed to initiate ${integration.name} connection:`,
        error
      );
      toastError({
        title: `Error connecting to ${integration.name}`,
        description:
          "Please try again or contact support if the issue persists.",
      });
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (!connectionId) {
      return;
    }

    try {
      const result = await toggleMcpConnectionAction(emailAccountId, {
        connectionId,
        isActive: enabled,
      });

      if (result?.serverError) {
        toastError({
          title: "Error toggling connection",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: `${integration.displayName} ${enabled ? "enabled" : "disabled"}`,
        });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: "Error toggling connection",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleToggleTool = async (toolId: string, isEnabled: boolean) => {
    try {
      const result = await toggleMcpToolAction(emailAccountId, {
        toolId,
        isEnabled,
      });

      if (result?.serverError) {
        toastError({
          title: "Error toggling tool",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Tool updated" });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: "Error toggling tool",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        "Are you sure you want to disconnect this integration? This will remove all associated tools."
      )
    ) {
      return;
    }

    if (!connectionId) {
      return;
    }

    setDisconnecting(true);

    try {
      const result = await disconnectMcpConnectionAction(emailAccountId, {
        connectionId,
      });

      if (result?.serverError) {
        toastError({
          title: "Error disconnecting",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          title: "Disconnected successfully",
          description: `Disconnected from ${integration.displayName}`,
        });
        onConnectionChange();
      }
    } catch (error) {
      toastError({
        title: "Error disconnecting",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            <DomainIcon domain={integration.url} size={32} />
            <span>{integration.displayName}</span>
          </div>
        </TableCell>
        <TableCell>
          {integration.comingSoon ? (
            <RequestAccessDialog integrationName={integration.displayName} />
          ) : integration.authType === "oauth" ||
            integration.authType === "api-token" ? (
            <div className="flex items-center gap-2">
              {connected ? (
                <div className="flex items-center gap-2">
                  <span
                    className={
                      isActive
                        ? "text-green-600 text-sm"
                        : "text-gray-500 text-sm"
                    }
                  >
                    {isActive ? "✓ Connected" : "○ Connected (Disabled)"}
                  </span>
                </div>
              ) : (
                <Button onClick={handleConnect} size="sm" variant="outline">
                  {integration.authType === "api-token"
                    ? "Connect with API Key"
                    : "Connect"}
                </Button>
              )}
            </div>
          ) : (
            <TypographyP className="text-gray-500 text-sm">
              No Auth Required
            </TypographyP>
          )}
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          {integration.comingSoon ? (
            <span className="text-gray-400 text-sm">Coming Soon</span>
          ) : connected && tools.length > 0 ? (
            <Button
              className="flex items-center gap-1"
              onClick={() => setExpandedTools(!expandedTools)}
              size="sm"
              variant="ghost"
            >
              {expandedTools ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {toolsCount}/{totalTools} tools
            </Button>
          ) : (
            <span className="text-gray-400 text-sm">No tools</span>
          )}
        </TableCell>
        <TableCell>
          {!integration.comingSoon && (
            <Toggle
              enabled={isActive}
              name={`integrations.${integration.name}.enabled`}
              onChange={handleToggle}
            />
          )}
        </TableCell>
        <TableCell>
          {connected && !integration.comingSoon && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Integration actions"
                  className="h-8 w-8 p-0"
                  size="sm"
                  variant="ghost"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {tools.length > 0 && (
                  <DropdownMenuItem
                    className="sm:hidden"
                    onClick={() => setExpandedTools(!expandedTools)}
                  >
                    {expandedTools ? "Hide tools" : "Manage tools"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-red-600"
                  disabled={disconnecting}
                  onClick={handleDisconnect}
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      </TableRow>

      {expandedTools && tools.length > 0 && (
        <ToolsList
          onToggleTool={handleToggleTool}
          tools={tools}
          toolsWarning={integration.toolsWarning}
        />
      )}
    </>
  );
}

interface ToolsListProps {
  onToggleTool: (toolId: string, isEnabled: boolean) => void;
  tools: NonNullable<
    GetIntegrationsResponse["integrations"][number]["connection"]
  >["tools"];
  toolsWarning?: string;
}

function ToolsList({ tools, onToggleTool, toolsWarning }: ToolsListProps) {
  const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <TableRow>
      <TableCell className="bg-muted/50" colSpan={5}>
        <div className="space-y-3">
          {toolsWarning && <Notice variant="warning">{toolsWarning}</Notice>}
          {sortedTools.map((tool) => (
            <div
              className={clsx(
                "flex items-start gap-4 rounded-lg border p-3",
                tool.isEnabled
                  ? "border-border bg-card"
                  : "border-muted bg-muted"
              )}
              key={tool.id}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={clsx(
                      "font-medium font-mono text-sm",
                      tool.isEnabled
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {tool.name}
                  </span>
                </div>
                {tool.description && (
                  <MutedText className="whitespace-pre-wrap">
                    {truncate(tool.description, 100)}
                  </MutedText>
                )}
              </div>
              <div className="flex-shrink-0">
                <Toggle
                  enabled={tool.isEnabled}
                  name={`tool.${tool.id}.enabled`}
                  onChange={(enabled) => onToggleTool(tool.id, enabled)}
                />
              </div>
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
