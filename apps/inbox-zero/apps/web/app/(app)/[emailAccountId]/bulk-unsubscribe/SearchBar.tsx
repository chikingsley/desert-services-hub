"use client";

import throttle from "lodash/throttle";
import { SearchIcon } from "lucide-react";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils";

export function SearchBar({
  onSearch,
  className,
}: {
  onSearch: (search: string) => void;
  className?: string;
}) {
  const throttledSearch = useCallback(
    throttle((value: string) => {
      onSearch(value.trim());
    }, 300),
    []
  );

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        onChange={(e) => throttledSearch(e.target.value)}
        placeholder="Search..."
        type="text"
      />
    </div>
  );
}
