"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLinkIcon, FolderIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import type {
  FolderItem,
  SavedFolder,
} from "@/app/api/user/drive/folders/route";
import type { AttachmentPreviewItem } from "@/app/api/user/drive/preview/attachments/route";
import { FilingStatusCell } from "@/components/drive/FilingStatusCell";
import { YesNoIndicator } from "@/components/drive/YesNoIndicator";
import { Input } from "@/components/Input";
import { TreeProvider, TreeView } from "@/components/kibo-ui/tree";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  MutedText,
  SectionDescription,
  TypographyH3,
  TypographyH4,
  TypographyP,
} from "@/components/Typography";
import { Button } from "@/components/ui/button";
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
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useFilingPreviewAttachments } from "@/hooks/useFilingPreviewAttachments";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  addFilingFolderAction,
  type FileAttachmentFiled,
  fileAttachmentAction,
  moveFilingAction,
  removeFilingFolderAction,
  submitPreviewFeedbackAction,
  updateFilingEnabledAction,
  updateFilingPromptAction,
} from "@/utils/actions/drive";
import {
  type UpdateFilingPromptBody,
  updateFilingPromptBody,
} from "@/utils/actions/drive.validation";
import { getEmailUrlForMessage } from "@/utils/url";
import {
  CreateFolderDialog,
  FolderNode,
  NoFoldersFound,
} from "./AllowedFolders";
import { DriveConnectionCard, getProviderInfo } from "./DriveConnectionCard";

type SetupPhase = "setup" | "loading-attachments" | "preview" | "starting";

type FilingState = {
  status: "pending" | "filing" | "filed" | "skipped" | "error";
  result?: FileAttachmentFiled;
  error?: string;
  skipReason?: string;
  filingId?: string; // Available for both filed and skipped items (for feedback)
};

export function DriveSetup() {
  const { emailAccountId } = useAccount();
  const { data: connectionsData } = useDriveConnections();
  const {
    data: foldersData,
    isLoading: foldersLoading,
    mutate: mutateFolders,
  } = useDriveFolders();
  const { data: emailAccount, mutate: mutateEmail } = useEmailAccountFull();

  const connections = connectionsData?.connections || [];
  const connection = connections[0];
  const providerInfo = connection ? getProviderInfo(connection.provider) : null;

  const [userPhase, setUserPhase] = useState<
    "setup" | "previewing" | "starting"
  >("setup");
  const [filingStates, setFilingStates] = useState<Record<string, FilingState>>(
    {}
  );

  const shouldFetchAttachments =
    userPhase === "previewing" || userPhase === "starting";
  const { data: attachmentsData, isLoading: attachmentsLoading } =
    useFilingPreviewAttachments(shouldFetchAttachments, {
      onSuccess: (data) => {
        // Initialize states and trigger filing for each attachment
        const initial: Record<string, FilingState> = {};
        for (const att of data.attachments) {
          const key = `${att.messageId}-${att.filename}`;
          initial[key] = { status: "filing" };

          fileAttachmentAction(emailAccountId, {
            messageId: att.messageId,
            filename: att.filename,
          })
            .then((result) => {
              const resultData = result?.data;
              if (result?.serverError) {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "error", error: result.serverError },
                }));
              } else if (resultData?.skipped) {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: {
                    status: "skipped",
                    skipReason: resultData.skipReason,
                    filingId: resultData.filingId,
                  },
                }));
              } else if (resultData) {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "filed", result: resultData },
                }));
              } else {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "error", error: "Unknown error" },
                }));
              }
            })
            .catch((err) => {
              setFilingStates((prev) => ({
                ...prev,
                [key]: {
                  status: "error",
                  error: err instanceof Error ? err.message : "Filing failed",
                },
              }));
            });
        }
        setFilingStates(initial);
      },
      onError: (err) => {
        toastError({
          title: "Error fetching preview",
          description:
            err instanceof Error
              ? err.message
              : "Failed to load recent attachments. Please try again.",
        });
        setUserPhase("setup");
      },
    });

  const displayPhase = useMemo((): SetupPhase => {
    if (userPhase === "setup") {
      return "setup";
    }
    if (userPhase === "starting") {
      return "starting";
    }
    if (attachmentsLoading) {
      return "loading-attachments";
    }
    if (attachmentsData) {
      return "preview";
    }
    return "loading-attachments";
  }, [userPhase, attachmentsLoading, attachmentsData]);

  const handlePreviewClick = useCallback(() => {
    setUserPhase("previewing");
  }, []);

  const handleStartFiling = useCallback(async () => {
    setUserPhase("starting");

    const result = await updateFilingEnabledAction(emailAccountId, {
      filingEnabled: true,
    });

    if (result?.serverError) {
      toastError({
        title: "Error starting auto-filing",
        description: result.serverError,
      });
      setUserPhase("previewing");
    } else {
      toastSuccess({ description: "Auto-filing started!" });
      mutateEmail();
    }
  }, [emailAccountId, mutateEmail]);

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="text-center">
        <TypographyH3>Let's set up auto-filing</TypographyH3>
        <SectionDescription className="mx-auto mt-3 max-w-xl">
          We'll file attachments from your emails into your{" "}
          {providerInfo?.name || "drive"}.<br />
          Just tell us where and how.
        </SectionDescription>
      </div>

      <div className="mt-6 flex justify-center">
        {connection ? (
          <DriveConnectionCard connection={connection} />
        ) : (
          <TypographyP>
            No drive connection found. Please connect your drive to continue
            setup.
          </TypographyP>
        )}
      </div>

      <div className="mt-10 space-y-8">
        <SetupFolderSelection
          availableFolders={foldersData?.availableFolders || []}
          connections={connections}
          emailAccountId={emailAccountId}
          isLoading={foldersLoading}
          mutateFolders={mutateFolders}
          savedFolders={foldersData?.savedFolders || []}
        />

        <SetupRulesForm
          emailAccountId={emailAccountId}
          hasFolders={foldersData ? foldersData.savedFolders.length > 0 : false}
          initialPrompt={emailAccount?.filingPrompt || ""}
          mutateEmail={mutateEmail}
          onPreviewClick={handlePreviewClick}
          phase={displayPhase}
        />

        {(displayPhase === "preview" || displayPhase === "starting") &&
          attachmentsData && (
            <PreviewContent
              attachments={attachmentsData.attachments}
              emailAccountId={emailAccountId}
              filingStates={filingStates}
              isStarting={displayPhase === "starting"}
              noAttachmentsFound={attachmentsData.noAttachmentsFound}
              onStartFiling={handleStartFiling}
              savedFolders={foldersData?.savedFolders || []}
            />
          )}
      </div>
    </div>
  );
}

function PreviewContent({
  emailAccountId,
  attachments,
  noAttachmentsFound,
  savedFolders,
  filingStates,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  attachments: AttachmentPreviewItem[];
  noAttachmentsFound: boolean;
  savedFolders: SavedFolder[];
  filingStates: Record<string, FilingState>;
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  if (noAttachmentsFound) {
    return (
      <NoAttachmentsMessage isStarting={isStarting} onSkip={onStartFiling} />
    );
  }

  return (
    <PreviewResults
      attachments={attachments}
      emailAccountId={emailAccountId}
      filingStates={filingStates}
      isStarting={isStarting}
      onStartFiling={onStartFiling}
      savedFolders={savedFolders}
    />
  );
}

function NoAttachmentsMessage({
  onSkip,
  isStarting,
}: {
  onSkip: () => void;
  isStarting: boolean;
}) {
  return (
    <div className="text-center">
      <MutedText className="mb-4">
        We couldn't find recent emails with attachments to preview.
      </MutedText>
      <Button loading={isStarting} onClick={onSkip}>
        Start auto-filing anyway
      </Button>
    </div>
  );
}

function PreviewResults({
  emailAccountId,
  attachments,
  savedFolders,
  filingStates,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  attachments: AttachmentPreviewItem[];
  savedFolders: SavedFolder[];
  filingStates: Record<string, FilingState>;
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  const { userEmail, provider } = useAccount();

  const allComplete = attachments.every((att) => {
    const key = `${att.messageId}-${att.filename}`;
    const status = filingStates[key]?.status;
    return status === "filed" || status === "skipped" || status === "error";
  });

  const anyFiling = attachments.some((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "filing" || !filingStates[key];
  });

  const filedCount = attachments.filter((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "filed";
  }).length;

  const skippedCount = attachments.filter((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "skipped";
  }).length;

  const statusMessage = allComplete
    ? filedCount > 0
      ? `Filed ${filedCount} attachment${filedCount !== 1 ? "s" : ""}${skippedCount > 0 ? `, skipped ${skippedCount}` : ""}:`
      : `Skipped ${skippedCount} attachment${skippedCount !== 1 ? "s" : ""} (didn't match your filing preferences):`
    : `Filing your ${attachments.length} most recent attachments...`;

  return (
    <div>
      <TypographyH4>3. See it in action</TypographyH4>
      <MutedText className="mt-1">{statusMessage}</MutedText>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Folder</TableHead>
              <TableHead className="w-[100px] text-right">Correct?</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attachments.map((attachment) => {
              const key = `${attachment.messageId}-${attachment.filename}`;
              return (
                <FilingRow
                  attachment={attachment}
                  emailAccountId={emailAccountId}
                  filingState={filingStates[key] || { status: "filing" }}
                  key={key}
                  provider={provider}
                  savedFolders={savedFolders}
                  userEmail={userEmail}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-center text-muted-foreground text-xs">
        Your feedback helps us learn
      </p>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          disabled={anyFiling}
          loading={isStarting}
          onClick={onStartFiling}
        >
          {anyFiling ? "Processing..." : "Looks good, start auto-filing"}
        </Button>
        <p className="text-muted-foreground text-xs">
          You'll get an email each time we file something. Reply to correct us.
        </p>
      </div>
    </div>
  );
}

function FilingRow({
  emailAccountId,
  attachment,
  filingState,
  savedFolders,
  userEmail,
  provider,
}: {
  emailAccountId: string;
  attachment: AttachmentPreviewItem;
  filingState: FilingState;
  savedFolders: SavedFolder[];
  userEmail: string;
  provider: string;
}) {
  const [correctedPath, setCorrectedPath] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [vote, setVote] = useState<boolean | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const voteBeforeDropdownRef = useRef<boolean | null>(null);

  const folderPath = correctedPath ?? filingState.result?.folderPath ?? null;

  const handleMoveToFolder = useCallback(
    async (folder: SavedFolder) => {
      const filingId = filingState.result?.filingId;
      if (!filingId) {
        return;
      }

      setIsMoving(true);

      try {
        await moveFilingAction(emailAccountId, {
          filingId,
          targetFolderId: folder.folderId,
          targetFolderPath: folder.folderPath,
        });
        setCorrectedPath(folder.folderPath);
        toastSuccess({ description: `Moved to ${folder.folderName}` });
      } catch {
        setVote(voteBeforeDropdownRef.current);
        toastError({ description: "Failed to move file" });
      } finally {
        setIsMoving(false);
      }
    },
    [emailAccountId, filingState.result?.filingId]
  );

  const handleCorrectClick = useCallback(async () => {
    const filingId = filingState.result?.filingId || filingState.filingId;
    if (!filingId) {
      return;
    }

    setVote(true);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: true,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: "Failed to submit feedback" });
    }
  }, [emailAccountId, filingState.result?.filingId, filingState.filingId]);

  const handleWrongClick = useCallback(async () => {
    const filingId = filingState.result?.filingId;
    if (!filingId) {
      return;
    }

    setVote(false);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: false,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: "Failed to submit feedback" });
    }
  }, [emailAccountId, filingState.result?.filingId]);

  const handleSkippedWrongClick = useCallback(async () => {
    const filingId = filingState.filingId;
    if (!filingId) {
      return;
    }

    setVote(false);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: false,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: "Failed to submit feedback" });
    }
  }, [emailAccountId, filingState.filingId]);

  const isFiled = filingState.status === "filed";
  const isSkipped = filingState.status === "skipped";

  const otherFolders = savedFolders.filter((f) => f.folderPath !== folderPath);

  const emailUrl = getEmailUrlForMessage(
    attachment.messageId,
    attachment.threadId,
    userEmail,
    provider
  );

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="max-w-[200px] truncate font-medium">
            {attachment.filename}
          </span>
          <Link
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            href={emailUrl}
            rel="noopener noreferrer"
            target="_blank"
            title="Open email"
          >
            <ExternalLinkIcon className="size-3.5" />
          </Link>
        </div>
      </TableCell>
      <TableCell className="max-w-[200px] break-words">
        <FilingStatusCell
          error={filingState.error}
          folderPath={folderPath}
          skipReason={filingState.skipReason}
          status={filingState.status}
        />
      </TableCell>
      <TableCell>
        {isFiled && otherFolders.length > 0 ? (
          <div className="flex items-center justify-end">
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
                    onClick={(value) => {
                      if (value) {
                        handleCorrectClick();
                      }
                    }}
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
                    disabled={isMoving}
                    key={folder.folderId}
                    onClick={() => handleMoveToFolder(folder)}
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
          </div>
        ) : isFiled ? (
          <div className="flex items-center justify-end">
            <YesNoIndicator
              onClick={(value) => {
                if (value) {
                  handleCorrectClick();
                } else {
                  handleWrongClick();
                }
              }}
              value={vote}
            />
          </div>
        ) : isSkipped && filingState.filingId ? (
          <div className="flex items-center justify-end">
            <YesNoIndicator
              onClick={(value) => {
                if (value) {
                  handleCorrectClick();
                } else {
                  handleSkippedWrongClick();
                }
              }}
              value={vote}
            />
          </div>
        ) : (
          <div className="h-8" />
        )}
      </TableCell>
    </TableRow>
  );
}

function SetupFolderSelection({
  emailAccountId,
  availableFolders,
  savedFolders,
  connections,
  mutateFolders,
  isLoading,
}: {
  emailAccountId: string;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
  connections: Array<{ id: string; provider: string }>;
  mutateFolders: () => void;
  isLoading: boolean;
}) {
  // Optimistic state for folder selection
  const [optimisticFolderIds, setOptimisticFolderIds] = useState<Set<string>>(
    () => new Set(savedFolders.map((f) => f.folderId))
  );
  // TODO: This assumes a single drive connection; swap to a selected connection ID when multi-connection UX exists.
  const driveConnectionId = connections[0]?.id ?? null;

  // Sync optimistic state when server data changes
  const serverFolderIds = savedFolders.map((f) => f.folderId).join(",");
  const prevServerFolderIds = useRef(serverFolderIds);
  if (serverFolderIds !== prevServerFolderIds.current) {
    prevServerFolderIds.current = serverFolderIds;
    setOptimisticFolderIds(new Set(savedFolders.map((f) => f.folderId)));
  }

  const handleFolderToggle = useCallback(
    async (folder: FolderItem, isChecked: boolean) => {
      const folderPath = folder.path || folder.name;

      // Optimistic update
      setOptimisticFolderIds((prev) => {
        const next = new Set(prev);
        if (isChecked) {
          next.add(folder.id);
        } else {
          next.delete(folder.id);
        }
        return next;
      });

      if (isChecked) {
        const result = await addFilingFolderAction(emailAccountId, {
          folderId: folder.id,
          folderName: folder.name,
          folderPath,
          driveConnectionId: folder.driveConnectionId,
        });

        if (result?.serverError) {
          // Revert on error
          setOptimisticFolderIds((prev) => {
            const next = new Set(prev);
            next.delete(folder.id);
            return next;
          });
          toastError({
            title: "Error adding folder",
            description: result.serverError,
          });
        } else {
          mutateFolders();
        }
      } else {
        const result = await removeFilingFolderAction(emailAccountId, {
          folderId: folder.id,
        });

        if (result?.serverError) {
          // Revert on error
          setOptimisticFolderIds((prev) => {
            const next = new Set(prev);
            next.add(folder.id);
            return next;
          });
          toastError({
            title: "Error removing folder",
            description: result.serverError,
          });
        } else {
          mutateFolders();
        }
      }
    },
    [emailAccountId, mutateFolders]
  );

  const rootFolders = useMemo(() => {
    const folderMap = new Map<string, FolderItem>();
    const roots: FolderItem[] = [];

    for (const folder of availableFolders) {
      folderMap.set(folder.id, folder);
    }

    for (const folder of availableFolders) {
      if (!(folder.parentId && folderMap.has(folder.parentId))) {
        roots.push(folder);
      }
    }

    return roots;
  }, [availableFolders]);

  const folderChildrenMap = useMemo(() => {
    const map = new Map<string, FolderItem[]>();
    for (const folder of availableFolders) {
      if (folder.parentId) {
        if (!map.has(folder.parentId)) {
          map.set(folder.parentId, []);
        }
        map.get(folder.parentId)!.push(folder);
      }
    }
    return map;
  }, [availableFolders]);

  return (
    <div>
      <TypographyH4>1. Pick your folders</TypographyH4>
      <MutedText className="mt-1">
        Which folders can we file to?{" "}
        <span className="text-muted-foreground">
          (We'll only ever put files in folders you select)
        </span>
      </MutedText>

      <LoadingContent error={undefined} loading={isLoading}>
        {rootFolders.length > 0 ? (
          <>
            <div className="mt-4">
              <TreeProvider
                animateExpand
                indent={16}
                selectable={false}
                showIcons
                showLines
              >
                <TreeView className="p-0">
                  {rootFolders.map((folder, index) => (
                    <FolderNode
                      folder={folder}
                      isDisabled={false}
                      isLast={index === rootFolders.length - 1}
                      key={folder.id}
                      knownChildren={folderChildrenMap.get(folder.id)}
                      level={0}
                      onToggle={handleFolderToggle}
                      parentPath=""
                      selectedFolderIds={optimisticFolderIds}
                    />
                  ))}
                </TreeView>
              </TreeProvider>
            </div>
            <div className="mt-2">
              <CreateFolderDialog
                driveConnectionId={driveConnectionId}
                emailAccountId={emailAccountId}
                onFolderCreated={mutateFolders}
                triggerClassName="text-muted-foreground hover:text-foreground"
                triggerIcon={PlusIcon}
                triggerLabel="Add folder"
                triggerSize="xs-2"
                triggerVariant="ghost"
              />
            </div>
          </>
        ) : (
          <NoFoldersFound
            driveConnectionId={driveConnectionId}
            emailAccountId={emailAccountId}
            onFolderCreated={mutateFolders}
          />
        )}
      </LoadingContent>
    </div>
  );
}

function SetupRulesForm({
  emailAccountId,
  initialPrompt,
  mutateEmail,
  hasFolders,
  phase,
  onPreviewClick,
}: {
  emailAccountId: string;
  initialPrompt: string;
  mutateEmail: () => void;
  hasFolders: boolean;
  phase: SetupPhase;
  onPreviewClick: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UpdateFilingPromptBody>({
    resolver: zodResolver(updateFilingPromptBody),
    defaultValues: {
      filingPrompt: initialPrompt,
    },
  });

  const filingPrompt = watch("filingPrompt");
  const canPreview = (filingPrompt || "").trim().length > 0 && hasFolders;
  const isLoading = phase === "loading-attachments";
  const showPreviewButton =
    phase === "setup" || phase === "loading-attachments";

  const onSubmit: SubmitHandler<UpdateFilingPromptBody> = useCallback(
    async (data) => {
      if (!canPreview) {
        toastError({
          title: "Setup incomplete",
          description:
            "Please select at least one folder and describe how you organize files.",
        });
        return;
      }

      const result = await updateFilingPromptAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error saving rules",
          description: result.serverError,
        });
      } else {
        mutateEmail();
        // Trigger preview after successful save
        onPreviewClick();
      }
    },
    [canPreview, emailAccountId, mutateEmail, onPreviewClick]
  );

  return (
    <div>
      <h3 className="font-semibold text-lg">2. Describe how you organize</h3>
      <MutedText className="mt-1">Tell us in plain English</MutedText>
      <form className="mt-4 space-y-3" onSubmit={handleSubmit(onSubmit)}>
        <Input
          autosizeTextarea
          error={errors.filingPrompt}
          name="filingPrompt"
          placeholder={`Contracts go to Transactions by property address.
Receipts go to Receipts by month.`}
          registerProps={register("filingPrompt")}
          rows={3}
          type="textarea"
        />
        {errors.filingPrompt && (
          <p className="text-red-500 text-sm">{errors.filingPrompt.message}</p>
        )}
        {showPreviewButton && (
          <div className="mt-10 text-center">
            <Button
              disabled={!canPreview || isLoading}
              loading={isLoading}
              type="submit"
            >
              {isLoading
                ? "Finding recent attachments..."
                : "Preview with my recent emails"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
