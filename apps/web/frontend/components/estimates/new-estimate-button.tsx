import { FileText } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/apps/web/frontend/components/ui/button";

interface NewEstimateButtonProps {
  children?: React.ReactNode;
  className?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "ghost";
}

export function NewEstimateButton({
  className,
  variant = "default",
  size = "default",
  children,
}: NewEstimateButtonProps) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const handleClick = async () => {
    if (isCreating) {
      return;
    }
    setIsCreating(true);

    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_name: "Untitled Estimate",
          status: "draft",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create estimate");
      }

      const data = (await res.json()) as { id: string };
      navigate(`/estimates/${data.id}`);
    } catch (_err) {
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
      {isCreating ? "Creating..." : children || "New Estimate"}
    </Button>
  );
}
