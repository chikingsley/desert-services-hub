import { FileText, Ruler } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { NewTakeoffDialog } from "@/apps/web/frontend/components/takeoffs/new-takeoff-dialog";
import { Button } from "@/apps/web/frontend/components/ui/button";

export function EstimatesEmptyActions() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const handleNewEstimate = async () => {
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
    <div className="flex items-center gap-2">
      <NewTakeoffDialog>
        <Button variant="outline">
          <Ruler className="mr-2 h-4 w-4" />
          Start from PDF
        </Button>
      </NewTakeoffDialog>
      <Button
        className="glow-primary"
        disabled={isCreating}
        onClick={handleNewEstimate}
      >
        <FileText className="mr-2 h-4 w-4" />
        {isCreating ? "Creating..." : "Create Manual Estimate"}
      </Button>
    </div>
  );
}
