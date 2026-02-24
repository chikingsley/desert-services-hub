"use client";

import { useAtomValue } from "jotai";
import { ArchiveIcon, Loader2Icon } from "lucide-react";
import * as React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useCommandPaletteCommands } from "@/hooks/useCommandPaletteCommands";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { fuzzySearch } from "@/lib/commands/fuzzy-search";
import type { Command, CommandSection } from "@/lib/commands/types";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { archiveEmails } from "@/store/archive-queue";
import { refetchEmailListAtom } from "@/store/email";

const SECTION_ORDER: CommandSection[] = [
  "actions",
  "navigation",
  "rules",
  "accounts",
  "settings",
];

const SECTION_LABELS: Record<CommandSection, string> = {
  actions: "Actions",
  navigation: "Navigation",
  rules: "Rules",
  accounts: "Switch Account",
  settings: "Settings",
};

export function CommandK() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const { emailAccountId } = useAccount();
  const { threadId, showEmail } = useDisplayedEmail();
  const refreshEmailList = useAtomValue(refetchEmailListAtom);
  const { onOpen: onOpenComposeModal } = useComposeModal();
  const { commands, isLoading } = useCommandPaletteCommands();

  const onArchive = React.useCallback(() => {
    if (threadId) {
      const threadIds = [threadId];
      archiveEmails({
        threadIds,
        onSuccess: () => {
          return refreshEmailList?.refetch({ removedThreadIds: threadIds });
        },
        emailAccountId,
      });
      showEmail(null);
    }
  }, [refreshEmailList, threadId, showEmail, emailAccountId]);

  // build action commands that include archive and compose
  const actionCommands = React.useMemo<Command[]>(() => {
    const actions: Command[] = [];

    if (threadId) {
      actions.unshift({
        id: "archive",
        label: "Archive",
        description: "Archive current email",
        icon: ArchiveIcon,
        shortcut: "E",
        section: "actions",
        priority: 0,
        keywords: ["archive", "remove", "delete"],
        action: () => onArchive(),
      });
    }

    return actions;
  }, [threadId, onArchive]);

  // combine action commands with dynamic commands
  const allCommands = React.useMemo(() => {
    return [...actionCommands, ...commands];
  }, [actionCommands, commands]);

  // filter commands with fuzzy search
  const filteredCommands = React.useMemo(() => {
    if (!search.trim()) {
      return allCommands;
    }
    return fuzzySearch(search, allCommands);
  }, [allCommands, search]);

  // group commands by section
  const groupedCommands = React.useMemo(() => {
    const groups: Record<CommandSection, Command[]> = {
      actions: [],
      navigation: [],
      rules: [],
      accounts: [],
      settings: [],
    };

    for (const command of filteredCommands) {
      groups[command.section].push(command);
    }

    return groups;
  }, [filteredCommands]);

  // execute command
  const executeCommand = React.useCallback((command: Command) => {
    setOpen(false);
    setSearch("");
    command.action();
  }, []);

  // memoized handlers to avoid re-renders
  const handleOpenChange = React.useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSearch("");
    }
  }, []);

  const commandProps = React.useMemo(
    () => ({
      // disable cmdk's built-in filter since we use custom fuzzy search
      shouldFilter: false,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key !== "Escape") {
          e.stopPropagation();
        }
      },
    }),
    []
  );

  // keyboard shortcuts
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // cmd+k to toggle palette
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // don't handle other shortcuts when palette is open
      if (open) {
        return;
      }

      // escape to close email preview
      if (e.key === "Escape") {
        if (threadId) {
          e.preventDefault();
          showEmail(null);
        }
        return;
      }

      // only handle shortcuts when focus is on body
      if (document?.activeElement?.tagName !== "BODY") {
        return;
      }

      // e for archive
      if ((e.key === "e" || e.key === "E") && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onArchive();
        return;
      }

      // c for compose
      if ((e.key === "c" || e.key === "C") && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenComposeModal();
        return;
      }
    };

    document.addEventListener("keydown", down);

    return () => {
      document.removeEventListener("keydown", down);
    };
  }, [open, onArchive, onOpenComposeModal, threadId, showEmail]);

  return (
    <CommandDialog
      commandProps={commandProps}
      onOpenChange={handleOpenChange}
      open={open}
    >
      <CommandInput
        onValueChange={setSearch}
        placeholder="Type a command or search..."
        value={search}
      />
      <CommandList>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <CommandEmpty>No results found.</CommandEmpty>
            {SECTION_ORDER.map((section, index) => {
              const sectionCommands = groupedCommands[section];
              if (sectionCommands.length === 0) {
                return null;
              }

              const showSeparator =
                index > 0 &&
                SECTION_ORDER.slice(0, index).some(
                  (s) => groupedCommands[s].length > 0
                );

              return (
                <React.Fragment key={section}>
                  {showSeparator && <CommandSeparator />}
                  <CommandGroup heading={SECTION_LABELS[section]}>
                    {sectionCommands.map((command) => (
                      <CommandItem
                        key={command.id}
                        onSelect={() => executeCommand(command)}
                        value={`${command.id} ${command.label} ${command.keywords?.join(" ") || ""}`}
                      >
                        {command.icon && (
                          <command.icon className="mr-2 h-4 w-4" />
                        )}
                        <div className="flex flex-1 flex-col">
                          <span>{command.label}</span>
                          {command.description && (
                            <span className="text-muted-foreground text-xs">
                              {command.description}
                            </span>
                          )}
                        </div>
                        {command.shortcut && (
                          <CommandShortcut>{command.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </React.Fragment>
              );
            })}
          </>
        )}
      </CommandList>
      <div className="flex items-center justify-center gap-4 border-t px-3 py-2 text-muted-foreground text-xs">
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ↑↓
          </kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ↵
          </kbd>
          select
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            esc
          </kbd>
          close
        </span>
      </div>
    </CommandDialog>
  );
}
