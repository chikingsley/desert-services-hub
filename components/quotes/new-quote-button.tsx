"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface NewQuoteButtonProps {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  children?: React.ReactNode;
}

export function NewQuoteButton({
  className,
  variant = "default",
  size = "default",
  children,
}: NewQuoteButtonProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const handleClick = async () => {
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
    <Button
      className={className}
      disabled={isCreating}
      onClick={handleClick}
      size={size}
      variant={variant}
    >
      <FileText className="mr-2 h-4 w-4" />
      {isCreating ? "Creating..." : children || "New Quote"}
    </Button>
  );
}
