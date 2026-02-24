import { Check, Users, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/apps/web/frontend/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/apps/web/frontend/components/ui/popover";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import type { SenderOption } from "./emails-helpers";

interface SenderFilterProps {
  onAddSender: (sender: SenderOption) => void;
  onClearSenders: () => void;
  onRemoveSender: (email: string) => void;
  selectedSenders: SenderOption[];
}

export function SenderFilter({
  selectedSenders,
  onAddSender,
  onRemoveSender,
  onClearSenders,
}: SenderFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const senderApiUrl = useMemo(() => {
    if (!open) {
      return null;
    }
    const params = new URLSearchParams();
    params.set("limit", "30");
    if (query.trim()) {
      params.set("q", query.trim());
    }
    return `/api/emails/senders?${params.toString()}`;
  }, [open, query]);

  const { data: senderData, isLoading } = useSWR<{
    senders: SenderOption[];
  }>(senderApiUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  const senderOptions = senderData?.senders ?? [];
  const selectedSet = useMemo(
    () => new Set(selectedSenders.map((s) => s.email)),
    [selectedSenders]
  );

  const handleSelect = useCallback(
    (sender: SenderOption) => {
      if (selectedSet.has(sender.email)) {
        onRemoveSender(sender.email);
      } else {
        onAddSender(sender);
      }
      setQuery("");
      setOpen(false);
    },
    [selectedSet, onAddSender, onRemoveSender]
  );

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button className="h-9" size="sm" variant="outline">
            <Users className="h-4 w-4" />
            {selectedSenders.length > 0
              ? `Senders (${selectedSenders.length})`
              : "Filter senders"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[340px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput
              className="h-9"
              onValueChange={setQuery}
              placeholder="Type sender name or email..."
              value={query}
            />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {isLoading ? "Loading senders..." : "No sender found."}
              </CommandEmpty>
              <CommandGroup>
                {senderOptions.map((sender) => {
                  const isSelected = selectedSet.has(sender.email);
                  return (
                    <CommandItem
                      key={sender.email}
                      onSelect={() => handleSelect(sender)}
                      value={`${sender.displayName} ${sender.email}`}
                    >
                      <Check
                        className={
                          isSelected
                            ? "h-4 w-4 opacity-100"
                            : "h-4 w-4 opacity-0"
                        }
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          {sender.displayName}
                        </div>
                        <div className="truncate text-muted-foreground text-xs">
                          {sender.email}
                        </div>
                      </div>
                      <span className="ml-auto text-muted-foreground text-xs">
                        {sender.count}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedSenders.length > 0 && (
        <div className="flex max-w-[420px] flex-wrap items-center gap-1">
          {selectedSenders.map((sender) => (
            <Badge
              className="gap-1 pr-1"
              key={sender.email}
              variant="secondary"
            >
              <span className="max-w-[170px] truncate">
                {sender.displayName}
              </span>
              <button
                aria-label={`Remove sender ${sender.email}`}
                className="rounded p-0.5 hover:bg-muted/60"
                onClick={() => onRemoveSender(sender.email)}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            className="h-7 px-2 text-xs"
            onClick={onClearSenders}
            size="sm"
            variant="ghost"
          >
            Clear
          </Button>
        </div>
      )}
    </>
  );
}
