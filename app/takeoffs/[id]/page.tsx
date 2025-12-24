"use client";

import { FileText, Loader2, Redo2, Save, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { FloatingTools } from "@/components/takeoffs/floating-tools";
import { Button } from "@/components/ui/button";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import type { TakeoffAnnotation, TakeoffToolType } from "@/lib/pdf-takeoff";
import { getTakeoff, saveTakeoffAnnotations } from "@/lib/supabase/takeoffs";
import { setTakeoffQuoteData } from "@/lib/takeoff-quote-store";
import { getTakeoffData } from "@/lib/takeoff-store";
import { aggregateTakeoffAnnotations } from "@/lib/takeoff-to-quote";

// Preset item types for desert services
export const PRESET_ITEMS = [
  {
    id: "temp_fence",
    label: "Temp Fence",
    color: "#ef4444",
    type: "linear" as const,
  },
  {
    id: "filter_sock",
    label: "Filter Sock",
    color: "#f97316",
    type: "linear" as const,
  },
  {
    id: "silt_fence",
    label: "Silt Fence",
    color: "#eab308",
    type: "linear" as const,
  },
  {
    id: "curb_inlet",
    label: "Curb Inlet",
    color: "#22c55e",
    type: "count" as const,
  },
  {
    id: "drop_inlet",
    label: "Drop Inlet",
    color: "#14b8a6",
    type: "count" as const,
  },
  {
    id: "rumble_grate",
    label: "Rumble Grate",
    color: "#3b82f6",
    type: "count" as const,
  },
  {
    id: "rock_entrance",
    label: "Rock Entrance",
    color: "#6366f1",
    type: "count" as const,
  },
  { id: "area", label: "Area", color: "#8b5cf6", type: "area" as const },
] as const;

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

export type PresetItem = (typeof PRESET_ITEMS)[number];

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
  if (points.length < 3) return 0;
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

// Helper to check if string is a valid UUID
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str
  );
}

export default function TakeoffEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [takeoffName, setTakeoffName] = useState("");
  const [selectedItem, setSelectedItem] = useState<PresetItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isFromDatabase, setIsFromDatabase] = useState(false);

  // Annotations with undo/redo support
  const {
    state: annotations,
    setState: setAnnotations,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetAnnotations,
  } = useUndoRedo<TakeoffAnnotation[]>([]);

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

  // Load takeoff data - from Supabase if UUID, otherwise from memory store or test PDF
  useEffect(() => {
    async function loadTakeoff() {
      // Try to load from Supabase if ID looks like a UUID
      if (isUUID(id)) {
        try {
          const takeoff = await getTakeoff(id);
          if (takeoff) {
            setPdfFile(takeoff.pdf_url);
            setTakeoffName(takeoff.name);
            setPageScales(takeoff.page_scales || {});
            resetAnnotations(takeoff.annotations || []);
            setIsFromDatabase(true);
            return;
          }
        } catch (error) {
          console.error("Error loading takeoff from database:", error);
        }
      }

      // Try memory store (for newly uploaded PDFs)
      const data = getTakeoffData(id);
      if (data) {
        setPdfFile(data.file);
        setTakeoffName(data.name);
      } else {
        // Fallback to test PDF for easier development
        setPdfFile("/westInnovativeDriveSwppp1.pdf");
        setTakeoffName("West Innovative Drive SWPPP");
      }
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
      // Undo: Ctrl+Z (or Cmd+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl+Shift+Z (or Cmd+Shift+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      // Redo: Ctrl+Y (Windows alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

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
          if (a.id !== id) return a;
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

  const handleToolClear = useCallback(() => {
    // Don't clear selection, just exit draw mode for current annotation
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
    return PRESET_ITEMS.map((item) => {
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
    }).filter((item) => item.count > 0);
  }, [annotations, currentScale.pixelsPerFoot]);

  // Convert selected preset item to takeoff tool type
  const activeTool: TakeoffToolType | null = selectedItem
    ? mapToolType(selectedItem.type)
    : null;

  const handleSave = async () => {
    // Only save if this is a database takeoff (has valid UUID)
    if (!isUUID(id)) {
      setSaveError("Cannot save: takeoff not yet created in database");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await saveTakeoffAnnotations(id, annotations, pageScales);
      // Success - could show a toast here
    } catch (error) {
      console.error("Error saving takeoff:", error);
      setSaveError("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateQuote = () => {
    // Aggregate annotations into summary items
    const safeAnnotations = Array.isArray(annotations) ? annotations : [];
    if (safeAnnotations.length === 0) {
      return;
    }

    const summaryItems = aggregateTakeoffAnnotations(
      safeAnnotations,
      currentScale.pixelsPerFoot
    );

    if (summaryItems.length === 0) {
      return;
    }

    // Store takeoff data for the quote creation page
    setTakeoffQuoteData({
      takeoffId: id,
      takeoffName: takeoffName || "Untitled Takeoff",
      summaryItems,
    });

    // Navigate to quote creation
    router.push("/quotes/new?from=takeoff");
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
    <div className="flex h-screen flex-col">
      {/* Header with breadcrumbs */}
      <PageHeader
        actions={
          <div className="flex items-center gap-1">
            <Button
              disabled={!canUndo}
              onClick={undo}
              size="sm"
              title="Undo (Ctrl+Z)"
              variant="ghost"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              disabled={!canRedo}
              onClick={redo}
              size="sm"
              title="Redo (Ctrl+Shift+Z)"
              variant="ghost"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button disabled={isSaving} onClick={handleSave} size="sm">
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              disabled={!hasAnnotations}
              onClick={handleCreateQuote}
              size="sm"
              title={hasAnnotations ? "Create quote from takeoff measurements" : "Add annotations first"}
              variant="default"
            >
              <FileText className="mr-2 h-4 w-4" />
              Create Quote
            </Button>
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
