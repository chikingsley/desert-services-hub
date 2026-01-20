import { FileText, Ruler } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { NewTakeoffDialog } from "@/components/takeoffs/new-takeoff-dialog";
import { Button } from "@/components/ui/button";

export function QuotesHeaderActions() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const handleNewQuote = async () => {
    if (isCreating) {
      return;
    }
    setIsCreating(true);

    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_name: "Untitled Quote", status: "draft" }),
      });

      if (!res.ok) {
        throw new Error("Failed to create quote");
      }

      const data = await res.json();
      navigate(`/quotes/${data.id}`);
    } catch (_err) {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <NewTakeoffDialog>
        <Button variant="outline">
          <Ruler className="mr-2 h-4 w-4" />
          New Takeoff
        </Button>
      </NewTakeoffDialog>
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
