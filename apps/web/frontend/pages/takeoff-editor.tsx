/**
 * Takeoff Editor Page
 */

import type {
  TakeoffAnnotation,
  TakeoffToolType,
} from "@takeoff/pdf-takeoff/types";
import {
  aggregateTakeoffAnnotations,
  type TakeoffCatalogItem,
} from "@takeoff/takeoff-to-estimate";
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
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import {
  SaveButtonIcon,
  SaveButtonLabel,
} from "@/apps/web/frontend/components/save-button";
import { FloatingTools } from "@/apps/web/frontend/components/takeoffs/floating-tools";
import {
  computeItemMeasurements,
  mapToolType,
} from "@/apps/web/frontend/components/takeoffs/takeoff-measurements";
import {
  type PresetItem,
  SCALE_PRESETS,
} from "@/apps/web/frontend/components/takeoffs/takeoff-presets";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Spinner } from "@/apps/web/frontend/components/ui/spinner";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

type SaveStatus = "saved" | "saving" | "unsaved";

interface TakeoffData {
  id: string;
  name: string;
  pdf_url: string | null;
  annotations: TakeoffAnnotation[];
  page_scales: Record<number, string>;
  status: string;
}

// Lazy load TakeoffViewer to avoid SSR issues with PDF.js
const TakeoffViewer = lazy(() =>
  import("@/apps/web/frontend/components/takeoffs/takeoff-viewer").then(
    (mod) => ({
      default: mod.TakeoffViewer,
    })
  )
);

export function TakeoffEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    data: takeoff,
    error,
    isLoading,
  } = useSWR<TakeoffData>(id ? `/api/takeoffs/${id}` : null, fetcher);

  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PresetItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [catalogItems, setCatalogItems] = useState<TakeoffCatalogItem[]>([]);
  const [presetItems, setPresetItems] = useState<PresetItem[]>([]);
  const [linkedEstimate, setLinkedEstimate] = useState<{
    id: string;
    base_number: string;
  } | null>(null);

  // Annotations state — init from SWR data when it arrives
  const [annotations, setAnnotationsInternal] = useState<TakeoffAnnotation[]>(
    []
  );
  const initializedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync SWR data into local state on first load
  useEffect(() => {
    if (takeoff && !initializedRef.current) {
      initializedRef.current = true;
      setAnnotationsInternal(takeoff.annotations || []);
      setPageScales(takeoff.page_scales || {});
    }
  }, [takeoff]);

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
  const [pageScales, setPageScales] = useState<Record<number, string>>({});
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
    if (!(takeoff && id)) {
      return;
    }

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
      } catch (err) {
        console.error("Error loading catalog items:", err);
      }

      // Check for linked estimate
      try {
        const estimateRes = await fetch(`/api/takeoffs/${id}/estimate`);
        if (estimateRes.ok) {
          const { estimate } = (await estimateRes.json()) as {
            estimate: { id: string; base_number: string } | null;
          };
          setLinkedEstimate(estimate);
        }
      } catch {
        // Ignore - linked estimate is optional
      }

      // Load PDF URL
      if (!takeoff?.pdf_url) {
        setPdfFile(null);
      } else if (
        takeoff.pdf_url.startsWith("minio://") ||
        takeoff.pdf_url.startsWith("sharepoint://")
      ) {
        setPdfFile(`/api/takeoffs/${id}/pdf`);
      } else {
        setPdfFile(takeoff.pdf_url);
      }
    }

    loadData();
  }, [id, takeoff]);

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

  const handleToolClear = useCallback(() => {
    // Tool clear handler - intentionally empty for now
  }, []);

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
  const counts = useMemo(
    () =>
      computeItemMeasurements(
        annotations,
        presetItems,
        currentScale.pixelsPerFoot
      ),
    [annotations, currentScale.pixelsPerFoot, presetItems]
  );

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

  const handleCreateEstimate = async () => {
    const safeAnnotations = Array.isArray(annotations) ? annotations : [];
    if (safeAnnotations.length === 0) {
      toast.error("No annotations to create estimate from");
      return;
    }

    const summaryItems = aggregateTakeoffAnnotations(
      safeAnnotations,
      currentScale.pixelsPerFoot,
      catalogItems
    );

    if (summaryItems.length === 0) {
      toast.error("Could not aggregate annotations into estimate items.");
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
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          takeoff_id: id,
          job_name: takeoff?.name || "Untitled Takeoff",
          status: "draft",
          sections: Array.from(sectionsMap.values()),
          line_items: lineItems,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error || "Failed to create estimate");
      }

      const data = (await res.json()) as { id: string };
      toast.success("Estimate created successfully");
      navigate(`/estimates/${data.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create estimate"
      );
    }
  };

  if (error) {
    return <PageError message={error.message} />;
  }

  if (isLoading || !takeoff) {
    return <PageLoading />;
  }

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

            {linkedEstimate ? (
              <Button
                onClick={() => navigate(`/estimates/${linkedEstimate.id}`)}
                size="sm"
                variant="outline"
              >
                <FileText className="mr-2 h-4 w-4" />
                View Estimate #{linkedEstimate.base_number}
              </Button>
            ) : (
              <Button
                disabled={!hasAnnotations}
                onClick={handleCreateEstimate}
                size="sm"
                variant="default"
              >
                <FileText className="mr-2 h-4 w-4" />
                Create Estimate
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
          scalePresets={SCALE_PRESETS}
          selectedItem={selectedItem}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
