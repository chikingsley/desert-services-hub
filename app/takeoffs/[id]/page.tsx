"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { FloatingTools } from "@/components/takeoffs/floating-tools";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { TakeoffAnnotation, TakeoffToolType } from "@/lib/pdf-takeoff";
import { aggregateTakeoffAnnotations } from "@/lib/takeoff-to-quote";
import { getTakeoff, saveTakeoffAnnotations } from "@/lib/takeoffs";
import { getTakeoffItems } from "@/services/quoting/catalog";

type SaveStatus = "saved" | "saving" | "unsaved";

interface SaveButtonProps {
  isSaving: boolean;
  saveStatus: SaveStatus;
}

function SaveButtonIcon({ isSaving, saveStatus }: SaveButtonProps) {
  if (isSaving || saveStatus === "saving") {
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

function SaveButtonLabel({ isSaving, saveStatus }: SaveButtonProps) {
  if (isSaving) {
    return "Saving...";
  }

  if (saveStatus === "saved") {
    return "Saved";
  }

  return "Save";
}

// Preset item type interface - now dynamic from database
export interface PresetItem {
  id: string;
  label: string;
  color: string;
  type: "count" | "linear" | "area";
}

// Common architectural/engineering scales
export const SCALE_PRESETS = [
  { id: "1_5", label: "1\" = 5'", pixelsPerFoot: 72 / 5 },
  { id: "1_10", label: "1\" = 10'", pixelsPerFoot: 72 / 10 },
  { id: "1_20", label: "1\" = 20'", pixelsPerFoot: 72 / 20 },
  { id: "1_30", label: "1\" = 30'", pixelsPerFoot: 72 / 30 },
  { id: "1_40", label: "1\" = 40'", pixelsPerFoot: 72 / 40 },
  { id: "1_50", label: "1\" = 50'", pixelsPerFoot: 72 / 50 },
  { id: "1_100", label: "1\" = 100'", pixelsPerFoot: 72 / 100 },
  { id: "custom", label: "Custom...", pixelsPerFoot: 0 },
] as const;

export type ScalePreset = (typeof SCALE_PRESETS)[number];

// Dynamic import to avoid SSR issues with PDF.js
const TakeoffViewer = dynamic(
  () =>
    import("@/components/takeoffs/takeoff-viewer").then(
      (mod) => mod.TakeoffViewer
    ),
  { ssr: false }
);

// Map preset item types to takeoff tool types
function mapToolType(
  presetType: "count" | "linear" | "area"
): TakeoffToolType | null {
  switch (presetType) {
    case "count":
      return "count";
    case "linear":
      return "polyline";
    case "area":
      return "polygon";
    default:
      return null;
  }
}

// Calculate polyline length in PDF points
function calculatePolylineLength(
  points: Array<{ x1: number; y1: number; width: number; height: number }>
): number {
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    // Convert from scaled to actual PDF points
    const x1 = (prev.x1 / prev.width) * 72 * (prev.width / 72);
    const y1 = (prev.y1 / prev.height) * 72 * (prev.height / 72);
    const x2 = (curr.x1 / curr.width) * 72 * (curr.width / 72);
    const y2 = (curr.y1 / curr.height) * 72 * (curr.height / 72);
    totalLength += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }
  return totalLength;
}

// Calculate polygon area in PDF points squared
function calculatePolygonArea(
  points: Array<{ x1: number; y1: number; width: number; height: number }>
): number {
  if (points.length < 3) {
    return 0;
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const x1 = curr.x1;
    const y1 = curr.y1;
    const x2 = next.x1;
    const y2 = next.y1;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

// Regex for UUID validation (at module level for performance)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper to check if string is a valid UUID
function isUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

// Interface for bundle items within a takeoff bundle
interface TakeoffBundleItem {
  id: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  isRequired: boolean;
  quantityMultiplier: number;
}

// Interface for catalog items from the API (now bundles)
interface TakeoffCatalogItem {
  id: string;
  code: string;
  label: string;
  description: string | null;
  unit: string;
  unitPrice: number;
  unitCost: number;
  color: string;
  type: "count" | "linear" | "area";
  isBundle?: boolean;
  bundleItems?: TakeoffBundleItem[];
  categoryId: string | null;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  notes: string | null;
  defaultQty: number;
}

export default function TakeoffEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [takeoffName, setTakeoffName] = useState("");
  const [selectedItem, setSelectedItem] = useState<PresetItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );
  const [, setIsFromDatabase] = useState(false);
  // Load catalog items directly from catalog.ts
  const catalogItems = useMemo(() => getTakeoffItems() as TakeoffCatalogItem[], []);
  const presetItems = useMemo(
    () =>
      catalogItems.map((item) => ({
        id: item.id,
        label: item.label,
        color: item.color,
        type: item.type,
      })),
    [catalogItems]
  );
  const [linkedQuote, setLinkedQuote] = useState<{
    id: string;
    base_number: string;
    job_name: string;
    status: string;
  } | null>(null);

  // Annotations state
  const [annotations, setAnnotationsInternal] = useState<TakeoffAnnotation[]>(
    []
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Wrapper to track unsaved changes
  const setAnnotations = useCallback(
    (
      updater:
        | TakeoffAnnotation[]
        | ((prev: TakeoffAnnotation[]) => TakeoffAnnotation[])
    ) => {
      setAnnotationsInternal(updater);
      setSaveStatus("unsaved");
    },
    []
  );

  // Reset annotations without triggering unsaved state
  const resetAnnotations = useCallback(
    (newAnnotations: TakeoffAnnotation[]) => {
      setAnnotationsInternal(newAnnotations);
      setSaveStatus("saved");
    },
    []
  );

  // Scale per page - default to 1" = 20'
  const [pageScales, setPageScales] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const currentScaleId = pageScales[currentPage] || "1_20";
  const currentScale =
    SCALE_PRESETS.find((s) => s.id === currentScaleId) || SCALE_PRESETS[2];

  // Handle page change from PDF viewer
  const handlePageChange = useCallback((pageNumber: number, total: number) => {
    setCurrentPage(pageNumber);
    setTotalPages(total);
  }, []);

  // Load takeoff data - from SQLite via API if UUID, otherwise from memory store or test PDF
  useEffect(() => {
    async function loadTakeoff() {
      // Try to load from SQLite via API if ID looks like a UUID
      if (isUUID(id)) {
        try {
          const takeoff = await getTakeoff(id);
          if (takeoff) {
            setTakeoffName(takeoff.name);
            setPageScales(takeoff.page_scales || {});
            resetAnnotations(takeoff.annotations || []);
            setIsFromDatabase(true);

            // Check if there's a linked quote
            try {
              const quoteRes = await fetch(`/api/takeoffs/${id}/quote`);
              if (quoteRes.ok) {
                const { quote } = await quoteRes.json();
                setLinkedQuote(quote);
              }
            } catch {
              // Ignore - linked quote is optional
            }

            // Check if PDF is stored in MinIO (starts with "minio://")
            if (takeoff.pdf_url?.startsWith("minio://")) {
              // Fetch fresh presigned URL from the PDF endpoint
              const pdfRes = await fetch(`/api/takeoffs/${id}/pdf`);
              if (pdfRes.ok) {
                const pdfData = await pdfRes.json();
                setPdfFile(pdfData.url);
              } else {
                console.error("Failed to get PDF URL from MinIO");
                setPdfFile(null);
              }
            } else if (takeoff.pdf_url) {
              // Use the stored URL directly (for legacy data or external URLs)
              setPdfFile(takeoff.pdf_url);
            }
            return;
          }
        } catch (error) {
          console.error("Error loading takeoff from database:", error);
        }
      }

      // Fallback to test PDF for development
      setPdfFile("/test-files/west-innovative-drive-swppp.pdf");
      setTakeoffName("West Innovative Drive SWPPP");
    }

    loadTakeoff();
  }, [id, resetAnnotations]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        return;
      }
      if (e.key === "Escape") {
        setSelectedItem(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleAnnotationAdd = useCallback(
    (annotation: TakeoffAnnotation) => {
      setAnnotations((prev) => [...prev, annotation]);
    },
    [setAnnotations]
  );

  const handleAnnotationDelete = useCallback(
    (id: string) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    },
    [setAnnotations]
  );

  const handleAnnotationUpdate = useCallback(
    (id: string, updates: Record<string, unknown>) => {
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== id) {
            return a;
          }
          // Type-safe merge based on annotation type
          if (a.type === "count" && "position" in updates) {
            return { ...a, position: updates.position } as TakeoffAnnotation;
          }
          if (
            (a.type === "polyline" || a.type === "polygon") &&
            "points" in updates
          ) {
            return { ...a, points: updates.points } as TakeoffAnnotation;
          }
          return a;
        })
      );
    },
    [setAnnotations]
  );

  const handleClearAll = useCallback(() => {
    setAnnotations([]);
  }, [setAnnotations]);

  // No-op callback - exits draw mode without clearing selection
  const handleToolClear = useCallback(() => {
    // Tool clear is handled internally by the viewer
  }, []);

  // Get next number for count annotations
  const getNextNumber = useCallback(
    (itemId: string) => {
      const safeAnnotations = Array.isArray(annotations) ? annotations : [];
      const countAnnotations = safeAnnotations.filter(
        (a) => a.type === "count" && a.itemId === itemId
      );
      return countAnnotations.length + 1;
    },
    [annotations]
  );

  // Handle scale change for current page
  const handleScaleChange = useCallback(
    (scaleId: string) => {
      setPageScales((prev) => ({ ...prev, [currentPage]: scaleId }));
    },
    [currentPage]
  );

  // Calculate counts and measurements for display
  const counts = useMemo(() => {
    // Ensure annotations is always an array
    const safeAnnotations = Array.isArray(annotations) ? annotations : [];
    return presetItems
      .map((item) => {
        const itemAnnotations = safeAnnotations.filter(
          (a) => a.itemId === item.id
        );

        if (item.type === "linear") {
          // Calculate total linear feet
          let totalLength = 0;
          for (const ann of itemAnnotations) {
            if (ann.type === "polyline" && ann.points) {
              totalLength += calculatePolylineLength(ann.points);
            }
          }
          // Convert PDF points to feet using scale
          const feet = totalLength / currentScale.pixelsPerFoot;
          return {
            ...item,
            value: feet > 0 ? `${Math.round(feet)} LF` : "0 LF",
            count: itemAnnotations.length,
            rawValue: feet,
          };
        }

        if (item.type === "area") {
          // Calculate total square feet
          let totalArea = 0;
          for (const ann of itemAnnotations) {
            if (ann.type === "polygon" && ann.points) {
              totalArea += calculatePolygonArea(ann.points);
            }
          }
          // Convert PDF points squared to square feet using scale squared
          const sqFeet = totalArea / currentScale.pixelsPerFoot ** 2;
          return {
            ...item,
            value: sqFeet > 0 ? `${Math.round(sqFeet)} SF` : "0 SF",
            count: itemAnnotations.length,
            rawValue: sqFeet,
          };
        }

        // Count items
        return {
          ...item,
          value: itemAnnotations.length,
          count: itemAnnotations.length,
          rawValue: itemAnnotations.length,
        };
      })
      .filter((item) => item.count > 0);
  }, [annotations, currentScale.pixelsPerFoot, presetItems]);

  // Convert selected preset item to takeoff tool type
  const activeTool: TakeoffToolType | null = selectedItem
    ? mapToolType(selectedItem.type)
    : null;

  // Auto-save (debounced)
  useEffect(() => {
    if (!isUUID(id) || saveStatus !== "unsaved") {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await saveTakeoffAnnotations(id, annotations, pageScales);
        setSaveStatus("saved");
      } catch (error) {
        console.error("Error auto-saving takeoff:", error);
        setSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [id, annotations, pageScales, saveStatus]);

  const handleSave = async () => {
    // Only save if this is a database takeoff (has valid UUID)
    if (!isUUID(id)) {
      toast.error("Cannot save: takeoff not yet created in database");
      return;
    }

    setIsSaving(true);
    setSaveStatus("saving");

    try {
      await saveTakeoffAnnotations(id, annotations, pageScales);
      setSaveStatus("saved");
    } catch (error) {
      console.error("Error saving takeoff:", error);
      setSaveStatus("unsaved");
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateQuote = async () => {
    // Aggregate annotations into summary items
    const safeAnnotations = Array.isArray(annotations) ? annotations : [];
    if (safeAnnotations.length === 0) {
      toast.error("No annotations to create quote from");
      return;
    }

    if (catalogItems.length === 0) {
      toast.error("No catalog items loaded. Please refresh and try again.");
      return;
    }

    // Pass catalog items to the aggregation function
    const summaryItems = aggregateTakeoffAnnotations(
      safeAnnotations,
      currentScale.pixelsPerFoot,
      catalogItems
    );

    if (summaryItems.length === 0) {
      // Check which annotation itemIds don't match catalog
      const catalogIds = new Set(catalogItems.map((c) => c.id));
      const missingIds = safeAnnotations
        .filter((a) => !catalogIds.has(a.itemId))
        .map((a) => a.itemId);

      if (missingIds.length > 0) {
        toast.error(
          `Annotations reference items not in catalog: ${missingIds.slice(0, 3).join(", ")}${missingIds.length > 3 ? "..." : ""}`
        );
      } else {
        toast.error("Could not aggregate annotations into quote items.");
      }
      return;
    }

    // Build sections and line items from takeoff data
    const sectionsMap = new Map<string, { id: string; name: string }>();
    const lineItems: Array<{
      section_id?: string;
      item: string;
      description: string;
      quantity: number;
      unit: string;
      unit_price: number;
      is_excluded: boolean;
    }> = [];

    for (const item of summaryItems) {
      const sectionId = item.sectionName.toLowerCase().replace(/\s+/g, "-");
      if (!sectionsMap.has(item.sectionName)) {
        sectionsMap.set(item.sectionName, {
          id: sectionId,
          name: item.sectionName,
        });
      }

      const qty = Math.round(item.quantity * 100) / 100;
      lineItems.push({
        section_id: sectionId,
        item: item.name,
        description: item.description,
        quantity: qty,
        unit: item.unit,
        unit_price: item.unitPrice,
        is_excluded: false,
      });
    }

    // Create quote via API
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          takeoff_id: id,
          job_name: takeoffName || "Untitled Takeoff",
          status: "draft",
          sections: Array.from(sectionsMap.values()),
          line_items: lineItems,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create quote");
      }

      const data = await res.json();
      toast.success("Quote created successfully");
      router.push(`/quotes/${data.id}`);
    } catch (err) {
      console.error("Failed to create quote:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to create quote"
      );
    }
  };

  // Check if there are any annotations to create a quote from
  const hasAnnotations = Array.isArray(annotations) && annotations.length > 0;

  if (!pdfFile) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading PDF...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with breadcrumbs */}
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            {/* Save button with status */}
            <Button
              disabled={isSaving || saveStatus === "saving"}
              onClick={handleSave}
              size="sm"
              variant={saveStatus === "unsaved" ? "default" : "outline"}
            >
              <SaveButtonIcon isSaving={isSaving} saveStatus={saveStatus} />
              <SaveButtonLabel isSaving={isSaving} saveStatus={saveStatus} />
            </Button>

            {/* Quote link/action */}
            {linkedQuote ? (
              <Button
                onClick={() => router.push(`/quotes/${linkedQuote.id}`)}
                size="sm"
                variant="outline"
              >
                <FileText className="mr-2 h-4 w-4" />
                View Quote #{linkedQuote.base_number}
              </Button>
            ) : (
              <Button
                disabled={!hasAnnotations}
                onClick={handleCreateQuote}
                size="sm"
                title={
                  hasAnnotations
                    ? "Create quote from takeoff measurements"
                    : "Add annotations first"
                }
                variant="default"
              >
                <FileText className="mr-2 h-4 w-4" />
                Create Quote
              </Button>
            )}
          </div>
        }
        breadcrumbs={[
          { label: "Takeoffs", href: "/takeoffs" },
          { label: takeoffName || "Untitled Takeoff" },
        ]}
        title={takeoffName || "Untitled Takeoff"}
      />

      {/* Main content - PDF viewer takes full space */}
      <div className="relative flex-1 overflow-hidden">
        <TakeoffViewer
          activeColor={selectedItem?.color ?? "#ef4444"}
          activeItemId={selectedItem?.id ?? ""}
          activeItemLabel={selectedItem?.label ?? ""}
          activeTool={activeTool}
          annotations={annotations}
          getNextNumber={getNextNumber}
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onPageChange={handlePageChange}
          onToolClear={handleToolClear}
          pdfUrl={pdfFile}
        />

        {/* Floating tools panel */}
        <FloatingTools
          counts={counts}
          currentPage={currentPage}
          currentScaleId={currentScaleId}
          items={presetItems}
          onClearAll={handleClearAll}
          onScaleChange={handleScaleChange}
          onSelectItem={setSelectedItem}
          selectedItem={selectedItem}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
