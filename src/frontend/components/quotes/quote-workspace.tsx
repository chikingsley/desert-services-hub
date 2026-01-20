import {
  ChevronDown,
  Download,
  Eye,
  Lock,
  Mail,
  Printer,
  Ruler,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useSettings } from "@/hooks/use-settings";
import { generatePDFBlob } from "@/lib/pdf/generate-client";
import type { GeneratePDFOptions } from "@/lib/pdf/pdf-builder";
import type { EditorQuote } from "@/lib/types";
import { catalog } from "@/services/quoting/catalog";
import { FloatingPdfOptions } from "./floating-pdf-options";
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

// Convert API response to EditorQuote format
interface ApiQuoteResponse {
  id: string;
  base_number: string;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  updated_at: string;
  current_version?: {
    id: string;
    total: number;
    sections: Array<{
      id: string;
      name: string;
      title?: string;
      sort_order: number;
    }>;
    line_items: Array<{
      id: string;
      section_id: string | null;
      description: string;
      quantity: number;
      unit: string;
      unit_price: number;
      notes: string | null;
      sort_order: number;
    }>;
  };
}

function apiToEditorQuote(
  api: ApiQuoteResponse,
  current: EditorQuote
): EditorQuote {
  const version = api.current_version;
  if (!version) {
    return current;
  }

  return {
    estimateNumber: api.base_number,
    date: current.date,
    estimator: current.estimator,
    estimatorEmail: current.estimatorEmail,
    billTo: {
      companyName: api.client_name ?? "",
      address: current.billTo.address,
      email: api.client_email ?? "",
      phone: api.client_phone ?? "",
    },
    jobInfo: {
      siteName: api.job_name,
      address: api.job_address ?? "",
    },
    sections: version.sections.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
    })),
    lineItems: version.line_items.map((item) => ({
      id: item.id,
      item: item.description,
      description: item.notes ?? "",
      qty: item.quantity,
      uom: item.unit,
      cost: item.unit_price,
      total: item.quantity * item.unit_price,
      sectionId: item.section_id ?? undefined,
    })),
    total: version.total,
  };
}

export function QuoteWorkspace({
  initialQuote,
  quoteId,
  versionId: _versionId,
  jobName,
  linkedTakeoff,
}: QuoteWorkspaceProps) {
  const { isMobile, open, openMobile, setOpen, setOpenMobile } = useSidebar();
  const sidebarSnapshotRef = useRef<{
    open: boolean;
    openMobile: boolean;
  } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [previewQuote, setPreviewQuote] = useState(initialQuote);

  // PDF blob URL for iframe preview
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // PDF generation options
  const [pdfOptions, setPdfOptions] = useState<GeneratePDFOptions>({
    style: "sectioned",
    unbreakableSections: true,
    includeBackPage: false,
  });

  // Save status lifted from InlineQuoteEditor
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );

  // Manual save trigger
  const [saveRef, setSaveRef] = useState<{ save: () => Promise<void> } | null>(
    null
  );
  const [isManualSaving, setIsManualSaving] = useState(false);

  // External update detection
  const lastKnownUpdateRef = useRef<string | null>(null);
  const [resetRef, setResetRef] = useState<{
    reset: (quote: EditorQuote) => void;
  } | null>(null);

  const { autoHideSidebar } = useSettings();

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

  const handleTogglePreview = useCallback(() => {
    if (!isPreviewOpen) {
      // Opening preview - snapshot current sidebar state before toggling
      sidebarSnapshotRef.current = { open, openMobile };
    }
    setIsPreviewOpen((prev) => !prev);
  }, [isPreviewOpen, open, openMobile]);

  // Handle sidebar state changes when preview opens/closes
  useEffect(() => {
    if (isPreviewOpen && autoHideSidebar) {
      // Auto-collapse sidebar when preview opens (if setting is enabled)
      if (isMobile) {
        setOpenMobile(false);
      } else {
        setOpen(false);
      }
    } else if (!isPreviewOpen && sidebarSnapshotRef.current) {
      // Restore sidebar state when preview closes
      if (isMobile) {
        setOpenMobile(sidebarSnapshotRef.current.openMobile);
      } else {
        setOpen(sidebarSnapshotRef.current.open);
      }
      sidebarSnapshotRef.current = null;
    }
  }, [isPreviewOpen, autoHideSidebar, isMobile, setOpen, setOpenMobile]);

  // Generate PDF blob when quote or options change (for live preview)
  useEffect(() => {
    let currentUrl: string | null = null;

    generatePDFBlob(previewQuote, pdfOptions)
      .then((blob) => {
        currentUrl = URL.createObjectURL(blob);
        setPdfBlobUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return currentUrl;
        });
      })
      .catch((err) => {
        console.error("PDF generation error:", err);
      });

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [previewQuote, pdfOptions]);

  // Initialize last known timestamp on mount
  useEffect(() => {
    const initTimestamp = async () => {
      const res = await fetch(`/api/quotes/${quoteId}`);
      if (res.ok) {
        const data: ApiQuoteResponse = await res.json();
        lastKnownUpdateRef.current = data.updated_at;
      }
    };
    initTimestamp().catch(() => {
      // Ignore initialization errors
    });
  }, [quoteId]);

  // Check for external updates when tab gains focus
  useEffect(() => {
    const checkForUpdates = async () => {
      // Skip if we have unsaved changes
      const hasUnsavedChanges =
        saveStatus === "unsaved" || saveStatus === "saving";
      if (hasUnsavedChanges) {
        return;
      }

      const res = await fetch(`/api/quotes/${quoteId}`);
      if (!res.ok) {
        return;
      }

      const data: ApiQuoteResponse = await res.json();
      const hasExternalChange =
        lastKnownUpdateRef.current &&
        data.updated_at !== lastKnownUpdateRef.current;

      if (hasExternalChange) {
        // Auto-refresh the editor with external changes
        const newQuote = apiToEditorQuote(data, previewQuote);
        setPreviewQuote(newQuote);
        resetRef?.reset(newQuote);
      }

      lastKnownUpdateRef.current = data.updated_at;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates().catch(() => {
          // Silently fail - non-critical background check
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [quoteId, saveStatus, previewQuote, resetRef]);

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
        sections: quote.sections.map((s) => ({
          id: s.id,
          name: s.name,
          title: s.title,
        })),
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
          notes: item.description,
        })),
      };

      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update quote");
      }

      // Update last known timestamp so we don't detect our own save as external
      if (data.updated_at) {
        lastKnownUpdateRef.current = data.updated_at;
      }
    },
    [quoteId]
  );

  const handlePreviewPdf = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDownloadPdf = () => {
    if (!pdfBlobUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = pdfBlobUrl;
    link.download = `quote-${previewQuote.estimateNumber || "draft"}.pdf`;
    link.click();
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
          <Link to={`/takeoffs/${linkedTakeoff.id}`}>
            <Ruler className="mr-2 h-4 w-4" />
            View Takeoff
          </Link>
        </Button>
      )}

      <Button
        onClick={handleTogglePreview}
        size="sm"
        variant={isPreviewOpen ? "default" : "outline"}
      >
        <Eye className="mr-2 h-4 w-4" />
        {isPreviewOpen ? "Hide Preview" : "Preview"}
      </Button>

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
          <DropdownMenuItem onClick={handleDownloadPdf}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePreviewPdf}>
            <Eye className="mr-2 h-4 w-4" />
            Open in New Tab
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader actions={actions} breadcrumbs={breadcrumbs} title={jobName} />

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        <div
          className={`flex h-full flex-col ${isPreviewOpen ? "lg:flex-row" : ""}`}
        >
          {/* Editor Panel */}
          <div className="flex h-full min-w-0 flex-1">
            <InlineQuoteEditor
              catalog={catalog}
              initialQuote={initialQuote}
              onQuoteChange={setPreviewQuote}
              onResetRef={setResetRef}
              onSave={handleSave}
              onSaveRef={setSaveRef}
              onSaveStatusChange={setSaveStatus}
              quoteId={quoteId}
            />
          </div>

          {/* PDF Preview Panel */}
          {isPreviewOpen && (
            <div className="relative hidden min-w-0 flex-1 flex-col border-border/50 border-l bg-muted lg:flex">
              <FloatingPdfOptions
                onChange={setPdfOptions}
                options={pdfOptions}
              />
              {pdfBlobUrl ? (
                <iframe
                  className="h-full w-full"
                  src={pdfBlobUrl}
                  title="PDF Preview"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating PDF...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile action bar for PDF preview */}
      {isPreviewOpen && (
        <div className="fixed right-0 bottom-0 left-0 z-20 flex items-center gap-3 border-border border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <Button
            className="flex-1"
            disabled={!pdfBlobUrl}
            onClick={handlePreviewPdf}
            size="lg"
            variant="secondary"
          >
            Preview PDF
          </Button>
          <Button
            className="flex-1"
            disabled={!pdfBlobUrl}
            onClick={handleDownloadPdf}
            size="lg"
          >
            Download PDF
          </Button>
        </div>
      )}
    </div>
  );
}
