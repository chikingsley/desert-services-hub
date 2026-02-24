"use client";

import { RefreshCcw } from "lucide-react";
import { ButtonLoader } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function LoadStatsButton() {
  const { isLoading, onLoadBatch } = useStatLoader();

  return (
    <div>
      <Button
        disabled={isLoading}
        onClick={() => onLoadBatch({ loadBefore: true, showToast: true })}
        variant="outline"
      >
        {isLoading ? (
          <ButtonLoader />
        ) : (
          <RefreshCcw className="mr-2 hidden h-4 w-4 sm:block" />
        )}
        {isLoading ? "Loading more..." : "Load more"}
      </Button>
    </div>
  );
}
