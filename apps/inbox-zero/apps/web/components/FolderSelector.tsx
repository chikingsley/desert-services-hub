import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  FolderIcon,
  Loader2,
  X,
} from "lucide-react";
import { useState } from "react";
import type { FieldError } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";
import { FOLDER_SEPARATOR, type OutlookFolder } from "@/utils/outlook/folders";

interface FolderItemProps {
  displayPath?: string;
  folder: OutlookFolder;
  level: number;
  onSelect: (folderId: string) => void;
  value: { name: string; id: string };
}

function FolderItem({
  folder,
  level,
  value,
  onSelect,
  displayPath,
}: FolderItemProps) {
  return (
    <div key={folder.id}>
      <CommandItem
        data-folder-id={folder.id}
        data-level={level}
        key={`${folder.id}-${level}`}
        onSelect={() => onSelect(folder.id)}
        value={folder.id}
      >
        <Check
          className={cn(
            "mr-2 h-4 w-4",
            value.id === folder.id ? "opacity-100" : "opacity-0"
          )}
        />
        <div className="flex items-center gap-2">
          {level > 0 &&
            Array.from({ length: level }, (_, i) => (
              <ChevronRight className="h-3 w-3 text-muted-foreground" key={i} />
            ))}
          <FolderIcon className="h-4 w-4" />
          <span>{displayPath || folder.displayName}</span>
        </div>
      </CommandItem>
      {folder.childFolders?.map((child) => (
        <div className={""} key={child.id}>
          <FolderItem
            folder={child}
            level={level + 1}
            onSelect={onSelect}
            value={value}
          />
        </div>
      ))}
    </div>
  );
}

interface FolderSelectorProps {
  error?: FieldError;
  folders: OutlookFolder[];
  isLoading: boolean;
  onChangeValue: (value: { name: string; id: string }) => void;
  placeholder?: string;
  value: { name: string; id: string };
}

export function FolderSelector({
  folders,
  isLoading,
  value,
  onChangeValue,
  placeholder = "Select a folder...",
  error,
}: FolderSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const findFolderById = (
    folderList: OutlookFolder[],
    targetId: string
  ): OutlookFolder | null => {
    for (const folder of folderList) {
      if (folder.id === targetId) {
        return folder;
      }
      if (folder.childFolders && folder.childFolders.length > 0) {
        const found = findFolderById(folder.childFolders, targetId);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const currentFolderId = value.id;
  const selectedFolder = currentFolderId
    ? findFolderById(folders, currentFolderId)
    : null;

  const filteredFolders =
    searchQuery.trim() === ""
      ? folders.map((folder) => ({ folder, displayPath: folder.displayName }))
      : filterFoldersRecursively(folders, searchQuery.toLowerCase());

  function filterFoldersRecursively(
    folderList: OutlookFolder[],
    query: string,
    parentPath = ""
  ): { folder: OutlookFolder; displayPath: string }[] {
    const results: { folder: OutlookFolder; displayPath: string }[] = [];

    for (const folder of folderList) {
      const currentPath = parentPath
        ? `${parentPath}${FOLDER_SEPARATOR}${folder.displayName}`
        : folder.displayName;
      if (folder.displayName.toLowerCase().includes(query)) {
        results.push({ folder, displayPath: currentPath });
      }
      if (folder.childFolders && folder.childFolders.length > 0) {
        const childResults = filterFoldersRecursively(
          folder.childFolders,
          query,
          currentPath
        );
        results.push(...childResults);
      }
    }

    return results;
  }

  const buildFolderPath = (folderId: string): string => {
    const folder = findFolderById(folders, folderId);
    if (!folder) {
      return "";
    }

    const findPath = (
      folderList: OutlookFolder[],
      targetId: string,
      currentPath: string[] = []
    ): string[] | null => {
      for (const f of folderList) {
        const newPath = [...currentPath, f.displayName];

        if (f.id === targetId) {
          return newPath;
        }

        if (f.childFolders && f.childFolders.length > 0) {
          const result = findPath(f.childFolders, targetId, newPath);
          if (result) {
            return result;
          }
        }
      }
      return null;
    };

    const pathParts = findPath(folders, folderId);
    return pathParts ? pathParts.join(FOLDER_SEPARATOR) : folder.displayName;
  };

  const handleFolderSelect = (folderId: string) => {
    const folder = findFolderById(folders, folderId);
    if (folder) {
      const fullPath = buildFolderPath(folderId);
      onChangeValue({
        name: fullPath,
        id: folder.id,
      });
      setOpen(false);
    }
  };

  return (
    <div>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className="w-full justify-between"
            disabled={isLoading}
            role="combobox"
            variant="outline"
          >
            <div className="flex flex-1 items-center gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading folders...</span>
                </>
              ) : value.id ? (
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-4 w-4" />
                  <span>{value.name || selectedFolder?.displayName || ""}</span>
                </div>
              ) : (
                placeholder
              )}
            </div>
            <div className="flex items-center gap-1">
              {value.id && !isLoading && (
                <Button
                  className="h-6 w-6 p-0 hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeValue({ name: "", id: "" });
                  }}
                  size="sm"
                  title="Clear folder selection"
                  variant="ghost"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput
              onValueChange={setSearchQuery}
              placeholder="Search folders..."
              value={searchQuery}
            />
            <CommandList
              onWheelCapture={(e) => {
                e.preventDefault();
                e.currentTarget.scrollTop += e.deltaY;
              }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Loading folders...</span>
                </div>
              ) : (
                <>
                  <CommandEmpty>No folder found.</CommandEmpty>
                  <CommandGroup>
                    {filteredFolders.map(({ folder, displayPath }) => {
                      return (
                        <FolderItem
                          displayPath={displayPath}
                          folder={folder}
                          key={folder.id}
                          level={0}
                          onSelect={handleFolderSelect}
                          value={value}
                        />
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <div className="mt-1 text-red-600 text-sm dark:text-red-400">
          {error.message}
        </div>
      )}
    </div>
  );
}
