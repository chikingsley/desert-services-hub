"use client";

import { Button } from "@/components/ui/button";

export function TestErrorButton() {
  return (
    <Button
      onClick={() => {
        throw new Error("Sentry Frontend Error");
      }}
      variant="destructive"
    >
      Throw error
    </Button>
  );
}
