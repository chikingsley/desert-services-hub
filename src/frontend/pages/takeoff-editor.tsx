/**
 * Takeoff Editor Page
 */
import { FileText } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { FloatingTools } from "@/components/takeoffs/floating-tools";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { TakeoffAnnotation, TakeoffToolType } from "@/lib/pdf-takeoff";
import {
  aggregateTakeoffAnnotations,
  type TakeoffCatalogItem,
} from "@/lib/takeoff-to-quote";

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

// Preset item type interface
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

// Lazy load TakeoffViewer to avoid SSR issues with PDF.js
const TakeoffViewer = lazy(() =>
  import("@/components/takeoffs/takeoff-viewer").then((mod) => ({
    default: mod.TakeoffViewer,
  }))
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
    area += curr.x1 * next.y1 - next.x1 * curr.y1;
  }
  return Math.abs(area) / 2;
}

interface TakeoffData {
  id: string;
  name: string;
  pdf_url: string | null;
  annotations: TakeoffAnnotation[];
  page_scales: Record<number, string>;
  status: string;
}

// Loader function
export async function takeoffLoader({ params }: LoaderFunctionArgs) {
  const response = await fetch(`/api/takeoffs/${params.id}`);
  if (!response.ok) {
    throw new Error("Failed to load takeoff");
  }
  return response.json();
}

export function TakeoffEditorPage() {
  const takeoff = useLoaderData() as TakeoffData;
  const navigate = useNavigate();
  const { id } = useParams();

  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PresetItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [catalogItems, setCatalogItems] = useState<TakeoffCatalogItem[]>([]);
  const [presetItems, setPresetItems] = useState<PresetItem[]>([]);
  const [linkedQuote, setLinkedQuote] = useState<{
    id: string;
    base_number: string;
  } | null>(null);

  // Annotations state
  const [annotations, setAnnotationsInternal] = useState<TakeoffAnnotation[]>(
    takeoff.annotations || []
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

  // Scale per page
  const [pageScales, setPageScales] = useState<Record<number, string>>(
    takeoff.page_scales || {}
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const currentScaleId = pageScales[currentPage] || "1_20";
  const currentScale =
    SCALE_PRESETS.find((s) => s.id === currentScaleId) || SCALE_PRESETS[2];

  const handlePageChange = useCallback((pageNumber: number, total: number) => {
    setCurrentPage(pageNumber);
    setTotalPages(total);
  }, []);

  // Load PDF URL and catalog items on mount
  useEffect(() => {
    async function loadData() {
      // Load catalog items
      try {
        const res = await fetch("/api/catalog/takeoff-items");
        if (res.ok) {
          const items: TakeoffCatalogItem[] = await res.json();
          setCatalogItems(items);
          setPresetItems(
            items.map((item) => ({
              id: item.id,
              label: item.label,
              color: item.color,
              type: item.type,
            }))
          );
        }
      } catch (error) {
        console.error("Error loading catalog items:", error);
      }

      // Check for linked quote
      try {
        const quoteRes = await fetch(`/api/takeoffs/${id}/quote`);
        if (quoteRes.ok) {
          const { quote } = await quoteRes.json();
          setLinkedQuote(quote);
        }
      } catch {
        // Ignore - linked quote is optional
      }

      // Load PDF URL
      if (takeoff.pdf_url?.startsWith("minio://")) {
        try {
          const pdfRes = await fetch(`/api/takeoffs/${id}/pdf`);
          if (pdfRes.ok) {
            const pdfData = await pdfRes.json();
            setPdfFile(pdfData.url);
          }
        } catch {
          setPdfFile(null);
        }
      } else if (takeoff.pdf_url) {
        setPdfFile(takeoff.pdf_url);
      }
    }

    loadData();
  }, [id, takeoff.pdf_url]);

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
    (annotationId: string) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    },
    [setAnnotations]
  );

  const handleAnnotationUpdate = useCallback(
    (annotationId: string, updates: Record<string, unknown>) => {
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== annotationId) {
            return a;
          }
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

  const handleToolClear = useCallback(() => {}, []);

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

  const handleScaleChange = useCallback(
    (scaleId: string) => {
      setPageScales((prev) => ({ ...prev, [currentPage]: scaleId }));
    },
    [currentPage]
  );

  // Calculate counts and measurements
  const counts = useMemo(() => {
    const safeAnnotations = Array.isArray(annotations) ? annotations : [];
    return presetItems
      .map((item) => {
        const itemAnnotations = safeAnnotations.filter(
          (a) => a.itemId === item.id
        );

        if (item.type === "linear") {
          let totalLength = 0;
          for (const ann of itemAnnotations) {
            if (ann.type === "polyline" && ann.points) {
              totalLength += calculatePolylineLength(ann.points);
            }
          }
          const feet = totalLength / currentScale.pixelsPerFoot;
          return {
            ...item,
            value: feet > 0 ? `${Math.round(feet)} LF` : "0 LF",
            count: itemAnnotations.length,
            rawValue: feet,
          };
        }

        if (item.type === "area") {
          let totalArea = 0;
          for (const ann of itemAnnotations) {
            if (ann.type === "polygon" && ann.points) {
              totalArea += calculatePolygonArea(ann.points);
            }
          }
          const sqFeet = totalArea / currentScale.pixelsPerFoot ** 2;
          return {
            ...item,
            value: sqFeet > 0 ? `${Math.round(sqFeet)} SF` : "0 SF",
            count: itemAnnotations.length,
            rawValue: sqFeet,
          };
        }

        return {
          ...item,
          value: itemAnnotations.length,
          count: itemAnnotations.length,
          rawValue: itemAnnotations.length,
        };
      })
      .filter((item) => item.count > 0);
  }, [annotations, currentScale.pixelsPerFoot, presetItems]);

  const activeTool: TakeoffToolType | null = selectedItem
    ? mapToolType(selectedItem.type)
    : null;

  // Auto-save
  useEffect(() => {
    if (saveStatus !== "unsaved") {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/takeoffs/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            annotations,
            page_scales: pageScales,
          }),
        });
        setSaveStatus("saved");
      } catch {
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
    setIsSaving(true);
    setSaveStatus("saving");

    try {
      await fetch(`/api/takeoffs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotations,
          page_scales: pageScales,
        }),
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateQuote = async () => {
    const safeAnnotations = Array.isArray(annotations) ? annotations : [];
    if (safeAnnotations.length === 0) {
      toast.error("No annotations to create quote from");
      return;
    }

    const summaryItems = aggregateTakeoffAnnotations(
      safeAnnotations,
      currentScale.pixelsPerFoot,
      catalogItems
    );

    if (summaryItems.length === 0) {
      toast.error("Could not aggregate annotations into quote items.");
      return;
    }

    const sectionsMap = new Map<string, { id: string; name: string }>();
    const lineItems: Array<{
      section_id?: string;
      item: string;
      description: string;
      quantity: number;
      unit: string;
      unit_price: number;
    }> = [];

    for (const item of summaryItems) {
      const sectionId = item.sectionName.toLowerCase().replace(/\s+/g, "-");
      if (!sectionsMap.has(item.sectionName)) {
        sectionsMap.set(item.sectionName, {
          id: sectionId,
          name: item.sectionName,
        });
      }

      lineItems.push({
        section_id: sectionId,
        item: item.name,
        description: item.description,
        quantity: Math.round(item.quantity * 100) / 100,
        unit: item.unit,
        unit_price: item.unitPrice,
      });
    }

    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          takeoff_id: id,
          job_name: takeoff.name || "Untitled Takeoff",
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
      navigate(`/quotes/${data.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create quote"
      );
    }
  };

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
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Button
              disabled={isSaving || saveStatus === "saving"}
              onClick={handleSave}
              size="sm"
              variant={saveStatus === "unsaved" ? "default" : "outline"}
            >
              <SaveButtonIcon isSaving={isSaving} saveStatus={saveStatus} />
              <SaveButtonLabel isSaving={isSaving} saveStatus={saveStatus} />
            </Button>

            {linkedQuote ? (
              <Button
                onClick={() => navigate(`/quotes/${linkedQuote.id}`)}
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
          { label: takeoff.name || "Untitled Takeoff" },
        ]}
        title={takeoff.name || "Untitled Takeoff"}
      />

      <div className="relative flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          }
        >
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
        </Suspense>

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
