"use client";

import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, FolderIcon, InfoIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GetDriveConnectionsResponse } from "@/app/api/user/drive/connections/route";
import type { GetFilingsResponse } from "@/app/api/user/drive/filings/route";
import { YesNoIndicator } from "@/components/drive/YesNoIndicator";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { MutedText, SectionHeader } from "@/components/Typography";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { useFilingActivity } from "@/hooks/useFilingActivity";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  moveFilingAction,
  submitPreviewFeedbackAction,
} from "@/utils/actions/drive";
import type { DriveProviderType } from "@/utils/drive/types";
import { getDriveFileUrl } from "@/utils/drive/url";

export function FilingActivity() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useFilingActivity({
    limit: 10,
    offset: 0,
  });
  const { data: connectionsData } = useDriveConnections();
  const { data: foldersData } = useDriveFolders();
  const refreshFilings = useCallback(() => {
    mutate();
  }, [mutate]);

  return (
    <div>
      <SectionHeader className="mb-3">Recent Activity</SectionHeader>
      <LoadingContent error={error} loading={isLoading}>
        {data?.filings.length === 0 ? (
          <MutedText className="italic">No recently filed documents.</MutedText>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead className="w-[100px]">When</TableHead>
                  <TableHead className="w-[80px] text-center">
                    Correct?
                  </TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.filings.map((filing) => (
                  <FilingRow
                    connections={connectionsData?.connections || []}
                    emailAccountId={emailAccountId}
                    filing={filing}
                    key={filing.id}
                    onFeedbackSaved={refreshFilings}
                    savedFolders={foldersData?.savedFolders || []}
                  />
                ))}
              </TableBody>
            </Table>
            {data && data.total > 10 && (
              <MutedText className="border-t p-3">
                Showing {data.filings.length} of {data.total} filings
              </MutedText>
            )}
          </div>
        )}
      </LoadingContent>
    </div>
  );
}

function FilingRow({
  emailAccountId,
  filing,
  connections,
  savedFolders,
  onFeedbackSaved,
}: {
  emailAccountId: string;
  filing: GetFilingsResponse["filings"][number];
  connections: GetDriveConnectionsResponse["connections"];
  savedFolders: { folderId: string; folderName: string; folderPath: string }[];
  onFeedbackSaved: () => void;
}) {
  const [vote, setVote] = useState<boolean | null>(
    filing.feedbackPositive ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const voteBeforeDropdownRef = useRef<boolean | null>(null);

  const connection = connections.find((c) => c.id === filing.driveConnectionId);

  const driveUrl = filing.fileId
    ? getDriveFileUrl(filing.fileId, connection?.provider as DriveProviderType)
    : null;

  const canGiveFeedback =
    filing.status !== "PENDING" && filing.status !== "ERROR";

  useEffect(() => {
    setVote(filing.feedbackPositive ?? null);
  }, [filing.feedbackPositive]);

  const handleCorrectClick = useCallback(async () => {
    if (!canGiveFeedback || isSubmitting) {
      return;
    }

    const previousValue = vote;
    setVote(true);
    setIsSubmitting(true);

    try {
      const result = await submitPreviewFeedbackAction(emailAccountId, {
        filingId: filing.id,
        feedbackPositive: true,
      });

      if (result?.serverError) {
        setVote(previousValue);
        toastError({ description: "Failed to submit feedback" });
        return;
      }

      onFeedbackSaved();
    } catch {
      setVote(previousValue);
      toastError({ description: "Failed to submit feedback" });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canGiveFeedback,
    emailAccountId,
    filing.id,
    isSubmitting,
    onFeedbackSaved,
    vote,
  ]);

  const handleMoveToFolder = useCallback(
    async (folderId: string, folderName: string, folderPath: string) => {
      if (!canGiveFeedback || isSubmitting) {
        return;
      }

      setIsSubmitting(true);

      try {
        const result = await moveFilingAction(emailAccountId, {
          filingId: filing.id,
          targetFolderId: folderId,
          targetFolderPath: folderPath,
        });

        if (result?.serverError) {
          setVote(voteBeforeDropdownRef.current);
          toastError({ description: "Failed to move file" });
          return;
        }

        toastSuccess({ description: `Moved to ${folderName}` });
      } catch {
        setVote(voteBeforeDropdownRef.current);
        toastError({ description: "Failed to move file" });
      } finally {
        setIsSubmitting(false);
      }
    },
    [canGiveFeedback, emailAccountId, filing.id, isSubmitting]
  );

  const handleWrongClick = useCallback(async () => {
    if (!canGiveFeedback || isSubmitting) {
      return;
    }

    const previousValue = vote;
    setVote(false);
    setIsSubmitting(true);

    try {
      const result = await submitPreviewFeedbackAction(emailAccountId, {
        filingId: filing.id,
        feedbackPositive: false,
      });

      if (result?.serverError) {
        setVote(previousValue);
        toastError({ description: "Failed to submit feedback" });
        return;
      }

      onFeedbackSaved();
    } catch {
      setVote(previousValue);
      toastError({ description: "Failed to submit feedback" });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canGiveFeedback,
    emailAccountId,
    filing.id,
    isSubmitting,
    onFeedbackSaved,
    vote,
  ]);

  const handleFeedbackClick = useCallback(
    (value: boolean) => {
      if (value) {
        handleCorrectClick();
      } else {
        handleWrongClick();
      }
    },
    [handleCorrectClick, handleWrongClick]
  );

  const otherFolders = savedFolders.filter(
    (f) => f.folderPath !== filing.folderPath
  );

  return (
    <TableRow>
      <TableCell>
        <span className="block max-w-[200px] truncate font-medium">
          {filing.filename}
        </span>
      </TableCell>
      <TableCell className="max-w-[200px] break-words">
        <FolderCell filing={filing} />
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground text-xs">
          {formatDistanceToNow(new Date(filing.createdAt), { addSuffix: true })}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center">
          {canGiveFeedback && !isSubmitting && otherFolders.length > 0 ? (
            <DropdownMenu
              onOpenChange={(open) => {
                setDropdownOpen(open);
                if (open) {
                  voteBeforeDropdownRef.current = vote;
                  setVote(false);
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <div>
                  <YesNoIndicator
                    dropdownTrigger="wrong"
                    onClick={handleFeedbackClick}
                    value={vote}
                    wrongActive={dropdownOpen}
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  Which folder does this file belong in?
                </DropdownMenuLabel>
                {otherFolders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.folderId}
                    onClick={() =>
                      handleMoveToFolder(
                        folder.folderId,
                        folder.folderName,
                        folder.folderPath
                      )
                    }
                  >
                    <FolderIcon className="size-4" />
                    {folder.folderName}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => setVote(voteBeforeDropdownRef.current)}
                >
                  Cancel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <YesNoIndicator
              onClick={
                canGiveFeedback && !isSubmitting
                  ? handleFeedbackClick
                  : undefined
              }
              value={vote}
            />
          )}
        </div>
      </TableCell>
      <TableCell>
        {driveUrl && (
          <a
            aria-label={`Open ${filing.filename} in drive`}
            className="text-muted-foreground hover:text-foreground"
            href={driveUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        )}
      </TableCell>
    </TableRow>
  );
}

function FolderCell({
  filing,
}: {
  filing: GetFilingsResponse["filings"][number];
}) {
  const isSkipped = !filing.folderPath;

  if (isSkipped) {
    return (
      <Tooltip content={filing.reasoning || "Doesn't match preferences"}>
        <span className="flex items-center gap-1.5 text-muted-foreground italic">
          Skipped
          <InfoIcon className="size-3.5 shrink-0" />
        </span>
      </Tooltip>
    );
  }

  return (
    <span className="block truncate text-muted-foreground">
      {filing.folderPath}
    </span>
  );
}
