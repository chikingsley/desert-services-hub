"use client";

import { FileText, Ruler } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function QuotesHeaderActions() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const handleNewQuote = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_name: "Untitled Quote", status: "draft" }),
      });

      if (!res.ok) throw new Error("Failed to create quote");

      const data = await res.json();
      router.push(`/quotes/${data.id}`);
    } catch (err) {
      console.error("Failed to create quote:", err);
      setIsCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline">
        <Link href="/takeoffs/new">
          <Ruler className="mr-2 h-4 w-4" />
          New Takeoff
        </Link>
      </Button>
      <Button
        className="glow-primary"
        disabled={isCreating}
        onClick={handleNewQuote}
      >
        <FileText className="mr-2 h-4 w-4" />
        {isCreating ? "Creating..." : "New Quote"}
      </Button>
    </div>
  );
}
