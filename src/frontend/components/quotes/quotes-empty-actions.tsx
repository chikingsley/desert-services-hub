import { FileText, Ruler } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

export function QuotesEmptyActions() {
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
      <Button asChild variant="outline">
        <Link to="/takeoffs/new">
          <Ruler className="mr-2 h-4 w-4" />
          Start from PDF
        </Link>
      </Button>
      <Button
        className="glow-primary"
        disabled={isCreating}
        onClick={handleNewQuote}
      >
        <FileText className="mr-2 h-4 w-4" />
        {isCreating ? "Creating..." : "Create Manual Quote"}
      </Button>
    </div>
  );
}
