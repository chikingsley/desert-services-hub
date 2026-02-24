"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FolderIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import type {
  FolderItem,
  SavedFolder,
} from "@/app/api/user/drive/folders/route";
import { Input } from "@/components/Input";
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
  useTree,
} from "@/components/kibo-ui/tree";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Card,
  CardBasic,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useDialogState } from "@/hooks/useDialogState";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { useDriveSubfolders } from "@/hooks/useDriveSubfolders";
import {
  addFilingFolderAction,
  createDriveFolderAction,
  removeFilingFolderAction,
} from "@/utils/actions/drive";
import {
  type CreateDriveFolderBody,
  createDriveFolderBody,
} from "@/utils/actions/drive.validation";

export function AllowedFolders({ emailAccountId }: { emailAccountId: string }) {
  const { data, isLoading, error, mutate } = useDriveFolders();
  const { data: connectionsData } = useDriveConnections();
  const driveConnectionId = connectionsData?.connections[0]?.id;

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data && (
        <AllowedFoldersContent
          availableFolders={data.availableFolders}
          driveConnectionId={driveConnectionId ?? null}
          emailAccountId={emailAccountId}
          mutateFolders={mutate}
          savedFolders={data.savedFolders}
        />
      )}
    </LoadingContent>
  );
}

function AllowedFoldersContent({
  emailAccountId,
  driveConnectionId,
  availableFolders,
  savedFolders,
  mutateFolders,
}: {
  emailAccountId: string;
  driveConnectionId: string | null;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
  mutateFolders: () => void;
}) {
  const [isFolderBusy, setIsFolderBusy] = useState(false);

  const handleFolderToggle = useCallback(
    async (folder: FolderItem, isChecked: boolean) => {
      const folderPath = folder.path || folder.name;
      setIsFolderBusy(true);

      try {
        if (isChecked) {
          const result = await addFilingFolderAction(emailAccountId, {
            folderId: folder.id,
            folderName: folder.name,
            folderPath,
            driveConnectionId: folder.driveConnectionId,
          });

          if (result?.serverError) {
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
            toastError({
              title: "Error removing folder",
              description: result.serverError,
            });
          } else {
            mutateFolders();
          }
        }
      } finally {
        setIsFolderBusy(false);
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

  const savedFolderIds = useMemo(
    () => new Set(savedFolders.map((f) => f.folderId)),
    [savedFolders]
  );
  const hasFolders = rootFolders.length > 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Allowed folders</CardTitle>
        <CardDescription>AI can only file to these folders</CardDescription>
      </CardHeader>
      <CardContent>
        {hasFolders ? (
          <>
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
                    isDisabled={isFolderBusy}
                    isLast={index === rootFolders.length - 1}
                    key={folder.id}
                    knownChildren={folderChildrenMap.get(folder.id)}
                    level={0}
                    onToggle={handleFolderToggle}
                    parentPath=""
                    selectedFolderIds={savedFolderIds}
                  />
                ))}
              </TreeView>
            </TreeProvider>
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
      </CardContent>
    </Card>
  );
}

export function FolderNode({
  folder,
  isLast,
  selectedFolderIds,
  onToggle,
  isDisabled,
  level,
  parentPath,
  knownChildren,
}: {
  folder: FolderItem;
  isLast: boolean;
  selectedFolderIds: Set<string>;
  onToggle: (folder: FolderItem, isChecked: boolean) => void;
  isDisabled: boolean;
  level: number;
  parentPath: string;
  knownChildren?: FolderItem[];
}) {
  const { expandedIds } = useTree();
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderIds.has(folder.id);
  const currentPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;

  const { data: subfoldersData, isLoading: isLoadingSubfolders } =
    useDriveSubfolders(
      isExpanded && !knownChildren
        ? {
            folderId: folder.id,
            driveConnectionId: folder.driveConnectionId,
          }
        : null
    );

  const subfolders = subfoldersData?.folders ?? knownChildren ?? [];
  const hasLoadedChildren = subfolders.length > 0;

  return (
    <TreeNode isLast={isLast} level={level} nodeId={folder.id}>
      <TreeNodeTrigger className="py-1">
        {isLoadingSubfolders ? (
          <div className="mr-1 flex h-4 w-4 items-center justify-center">
            <Loader2Icon className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TreeExpander hasChildren={true} />
        )}
        <TreeIcon hasChildren />
        <div className="flex flex-1 items-center gap-2">
          <Checkbox
            checked={isSelected}
            disabled={isDisabled}
            id={`folder-${folder.id}`}
            onCheckedChange={(checked) =>
              onToggle({ ...folder, path: currentPath }, checked === true)
            }
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
          />
          <TreeLabel>{folder.name}</TreeLabel>
        </div>
      </TreeNodeTrigger>
      <TreeNodeContent hasChildren={isExpanded}>
        {hasLoadedChildren ? (
          subfolders.map((subfolder, index) => (
            <FolderNode
              folder={{
                ...subfolder,
                path: `${currentPath}/${subfolder.name}`,
              }}
              isDisabled={isDisabled}
              isLast={index === subfolders.length - 1}
              key={subfolder.id}
              level={level + 1}
              onToggle={onToggle}
              parentPath={currentPath}
              selectedFolderIds={selectedFolderIds}
            />
          ))
        ) : isExpanded && !isLoadingSubfolders ? (
          <div
            className="py-1 text-muted-foreground text-xs italic"
            style={{ paddingLeft: (level + 1) * 16 + 28 }}
          >
            No subfolders
          </div>
        ) : null}
      </TreeNodeContent>
    </TreeNode>
  );
}

export function NoFoldersFound({
  emailAccountId,
  driveConnectionId,
  onFolderCreated,
}: {
  emailAccountId: string;
  driveConnectionId: string | null;
  onFolderCreated?: () => void;
}) {
  const { isOpen, onClose, onToggle } = useDialogState();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateDriveFolderBody>({
    resolver: zodResolver(createDriveFolderBody),
    defaultValues: { driveConnectionId: "" },
  });

  const onSubmit: SubmitHandler<CreateDriveFolderBody> = useCallback(
    async (data) => {
      if (!driveConnectionId) {
        toastError({
          title: "Error creating folder",
          description: "No drive connection found",
        });
        return;
      }

      const result = await createDriveFolderAction(emailAccountId, {
        ...data,
        driveConnectionId,
      });

      if (result?.serverError) {
        toastError({
          title: "Error creating folder",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Folder created!" });
        reset();
        onClose();
        onFolderCreated?.();
      }
    },
    [emailAccountId, reset, onClose, onFolderCreated, driveConnectionId]
  );

  return (
    <CardBasic className="mt-4 p-2">
      <Empty className="border-0 p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderIcon />
          </EmptyMedia>
          <EmptyTitle>No folders found</EmptyTitle>
          <EmptyDescription>
            Create a folder in your drive to get started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <CreateFolderDialog
            driveConnectionId={driveConnectionId}
            emailAccountId={emailAccountId}
            onFolderCreated={onFolderCreated}
            triggerLabel="Create folder"
          />
        </EmptyContent>
      </Empty>
    </CardBasic>
  );
}

export function CreateFolderDialog({
  emailAccountId,
  driveConnectionId,
  onFolderCreated,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "default",
  triggerIcon,
  triggerClassName,
}: {
  emailAccountId: string;
  driveConnectionId: string | null;
  onFolderCreated?: () => void;
  triggerLabel: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerIcon?: ButtonProps["Icon"];
  triggerClassName?: string;
}) {
  const { isOpen, onClose, onToggle } = useDialogState();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateDriveFolderBody>({
    resolver: zodResolver(createDriveFolderBody),
    defaultValues: { driveConnectionId: "" },
  });

  const onSubmit: SubmitHandler<CreateDriveFolderBody> = useCallback(
    async (data) => {
      if (!driveConnectionId) {
        toastError({
          title: "Error creating folder",
          description: "No drive connection found",
        });
        return;
      }

      const result = await createDriveFolderAction(emailAccountId, {
        ...data,
        driveConnectionId,
      });

      if (result?.serverError) {
        toastError({
          title: "Error creating folder",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Folder created!" });
        reset();
        onClose();
        onFolderCreated?.();
      }
    },
    [emailAccountId, reset, onClose, onFolderCreated, driveConnectionId]
  );

  return (
    <Dialog onOpenChange={onToggle} open={isOpen}>
      <DialogTrigger asChild>
        <Button
          className={triggerClassName}
          disabled={!driveConnectionId}
          Icon={triggerIcon}
          size={triggerSize}
          variant={triggerVariant}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create folder</DialogTitle>
          <DialogDescription>
            Create a new folder in your drive to organize your files.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            error={errors.folderName}
            label="Folder name"
            name="folderName"
            placeholder="e.g. Receipts"
            registerProps={register("folderName")}
            type="text"
          />
          <Button loading={isSubmitting} type="submit">
            Create folder
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
