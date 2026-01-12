"use client";

import {
  ChevronDown,
  Download,
  Lock,
  Mail,
  Printer,
  Ruler,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { Catalog, EditorQuote } from "@/lib/types";
import { InlineQuoteEditor } from "./inline-quote-editor";

type SaveStatus = "saved" | "saving" | "unsaved";

interface SaveButtonProps {
  isManualSaving: boolean;
  saveStatus: SaveStatus;
}

function SaveButtonIcon({ isManualSaving, saveStatus }: SaveButtonProps) {
  if (isManualSaving || saveStatus === "saving") {
    return <Spinner className="mr-2 h-4 w-4" />;
  }

  if (saveStatus === "saved") {
    return (
      <span className="mr-2 flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20">
        <span className="h-2 w-2 rounded-full bg-green-500" />
      </span>
    );
  }

  return (
    <span className="mr-2 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
    </span>
  );
}

function SaveButtonLabel({ isManualSaving, saveStatus }: SaveButtonProps) {
  if (isManualSaving) {
    return "Saving...";
  }

  if (saveStatus === "saved") {
    return "Saved";
  }

  return "Save";
}

interface QuoteWorkspaceProps {
  initialQuote: EditorQuote;
  quoteId: string;
  versionId: string;
  jobName: string;
  linkedTakeoff: { id: string; name: string } | null;
}

export function QuoteWorkspace({
  initialQuote,
  quoteId,
  versionId: _versionId,
  jobName,
  linkedTakeoff,
}: QuoteWorkspaceProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Save status lifted from InlineQuoteEditor
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );

  // Manual save trigger
  const [saveRef, setSaveRef] = useState<{ save: () => Promise<void> } | null>(
    null
  );
  const [isManualSaving, setIsManualSaving] = useState(false);

  const handleManualSave = async () => {
    if (!saveRef) {
      return;
    }
    setIsManualSaving(true);
    try {
      await saveRef.save();
    } finally {
      setIsManualSaving(false);
    }
  };

  // Fetch catalog from API
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await fetch("/api/catalog");
        if (res.ok) {
          const data = await res.json();
          setCatalog(data);
        }
      } catch (err) {
        console.error("Failed to fetch catalog:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCatalog();
  }, []);

  const handleSave = useCallback(
    async (quote: EditorQuote) => {
      // Convert editor format to API format
      const payload = {
        base_number: quote.estimateNumber,
        job_name: quote.jobInfo.siteName || "Untitled Quote",
        job_address: quote.jobInfo.address || null,
        client_name: quote.billTo.companyName || null,
        client_email: quote.billTo.email || null,
        client_phone: quote.billTo.phone || null,
        status: "draft",
        total: quote.total,
        sections: quote.sections.map((s) => ({ id: s.id, name: s.name })),
        line_items: quote.lineItems.map((item) => ({
          section_id: item.sectionId,
          description: item.item || item.description,
          item: item.item,
          quantity: item.qty,
          qty: item.qty,
          unit: item.uom,
          uom: item.uom,
          unit_cost: item.cost * 0.7,
          unit_price: item.cost,
          cost: item.cost,
          is_excluded: item.isStruck,
          isStruck: item.isStruck,
          notes: item.description,
        })),
      };

      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update quote");
      }
    },
    [quoteId]
  );

  const handleExportPdf = () => {
    window.open(`/api/quotes/${quoteId}/pdf`, "_blank");
  };

  const handleFinalize = () => {
    // TODO: Implement version finalization
  };

  const breadcrumbs = [
    { label: "Quotes", href: "/quotes" },
    { label: jobName },
  ];

  const actions = (
    <div className="flex items-center gap-2">
      {/* Takeoff link if there's a linked takeoff */}
      {linkedTakeoff && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/takeoffs/${linkedTakeoff.id}`}>
            <Ruler className="mr-2 h-4 w-4" />
            View Takeoff
          </Link>
        </Button>
      )}

      {/* Save button with status */}
      <Button
        disabled={isManualSaving || saveStatus === "saving"}
        onClick={handleManualSave}
        size="sm"
        variant={saveStatus === "unsaved" ? "default" : "outline"}
      >
        <SaveButtonIcon
          isManualSaving={isManualSaving}
          saveStatus={saveStatus}
        />
        <SaveButtonLabel
          isManualSaving={isManualSaving}
          saveStatus={saveStatus}
        />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
            <ChevronDown className="ml-2 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleExportPdf}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Mail className="mr-2 h-4 w-4" />
            Send via Email
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button onClick={handleFinalize} size="sm">
        <Lock className="mr-2 h-4 w-4" />
        Finalize
      </Button>
    </div>
  );

  if (isLoading || !catalog) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader breadcrumbs={breadcrumbs} title={jobName} />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <div className="h-6 w-6 animate-pulse rounded-lg bg-primary/30" />
              </div>
              <div className="absolute -right-1 -bottom-1 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
            <p className="text-muted-foreground text-sm">Loading catalog...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader actions={actions} breadcrumbs={breadcrumbs} title={jobName} />

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        <InlineQuoteEditor
          catalog={catalog}
          initialQuote={initialQuote}
          onSave={handleSave}
          onSaveRef={setSaveRef}
          onSaveStatusChange={setSaveStatus}
          quoteId={quoteId}
        />
      </div>
    </div>
  );
}
