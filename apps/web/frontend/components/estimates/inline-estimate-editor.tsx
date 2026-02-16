"use client";

import type { Catalog } from "@estimates/catalog/types";
import type { EditorEstimate, EditorLineItem } from "@lib/db/types";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CatalogCombobox } from "@/apps/web/frontend/components/estimates/catalog-combobox";
import { EstimateHeaderForm } from "@/apps/web/frontend/components/estimates/estimate-header-form";
import { EstimateLineItemRow } from "@/apps/web/frontend/components/estimates/estimate-line-item-row";
import { SectionCombobox } from "@/apps/web/frontend/components/estimates/section-combobox";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Input } from "@/apps/web/frontend/components/ui/input";
import { Label } from "@/apps/web/frontend/components/ui/label";
import { useEstimateEditor } from "@/hooks/use-estimate-editor";
import { formatCurrency } from "@/lib/utils";

interface InlineEstimateEditorProps {
  catalog: Catalog;
  initialEstimate?: EditorEstimate;
  onSave?: (estimate: EditorEstimate) => Promise<void>;
  onSaveStatusChange?: (status: "saved" | "saving" | "unsaved") => void;
  onEstimateChange?: (estimate: EditorEstimate) => void;
  onSaveRef?: (ref: { save: () => Promise<void> } | null) => void;
  onResetRef?: (
    ref: { reset: (estimate: EditorEstimate) => void } | null
  ) => void;
  estimateId?: string | null;
  compactRows?: boolean;
}

export function InlineEstimateEditor({
  catalog,
  initialEstimate,
  onSave,
  onSaveStatusChange,
  onEstimateChange,
  onSaveRef,
  onResetRef,
  compactRows = false,
}: InlineEstimateEditorProps) {
  const {
    estimate,
    updateEstimate,
    updateLineItem,
    updateLineItemFromCatalog,
    addLineItem,
    removeLineItem,
    addFromCatalog,
    addCategoryItems,
    removeSection,
    updateSectionTitle,
    duplicateSection,
    loadEstimate,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEstimateEditor({ initialEstimate, catalog });

  // Track which section to scroll to after it renders
  const scrollToSectionRef = useRef<string | null>(null);

  // Handler for duplicating a section - sets the scroll target
  const handleDuplicateSection = useCallback(
    (sectionId: string) => {
      const newSectionId = duplicateSection(sectionId);
      if (newSectionId) {
        scrollToSectionRef.current = newSectionId;
      }
    },
    [duplicateSection]
  );

  const handleEditorShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (event.code !== "KeyZ" || event.isComposing) {
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (event.shiftKey) {
        if (!canRedo) {
          return;
        }

        event.preventDefault();
        redo();
        return;
      }

      if (!canUndo) {
        return;
      }

      event.preventDefault();
      undo();
    },
    [canRedo, canUndo, redo, undo]
  );

  const isTextInputTarget = useCallback((target: EventTarget | null) => {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement &&
        target.isContentEditable &&
        target.contentEditable === "true")
    );
  }, []);

  useEffect(() => {
    const handleEditorShortcutWithGuard = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      handleEditorShortcut(event);
    };

    window.addEventListener("keydown", handleEditorShortcutWithGuard);

    return () => {
      window.removeEventListener("keydown", handleEditorShortcutWithGuard);
    };
  }, [handleEditorShortcut, isTextInputTarget]);

  // Effect to scroll to new section after it renders
  useEffect(() => {
    if (scrollToSectionRef.current) {
      const targetId = scrollToSectionRef.current;
      // Check if the section exists in the estimate
      const sectionExists = estimate.sections.some((s) => s.id === targetId);

      if (sectionExists) {
        const element = document.getElementById(`section-${targetId}`);
        if (element) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          // Add highlight effect
          element.classList.add("ring-2", "ring-primary");
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-primary");
          }, 2000);
          // Clear the ref so we don't scroll again
          scrollToSectionRef.current = null;
        }
      }
    }
  }, [estimate.sections]);

  const [_saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Refs for parent callbacks — avoids sync effects and unstable deps
  const onSaveStatusChangeRef = useRef(onSaveStatusChange);
  onSaveStatusChangeRef.current = onSaveStatusChange;

  const onEstimateChangeRef = useRef(onEstimateChange);
  onEstimateChangeRef.current = onEstimateChange;

  // Update save status and notify parent in one call (no sync effect needed)
  const updateSaveStatus = useCallback(
    (status: "saved" | "saving" | "unsaved") => {
      setSaveStatus(status);
      onSaveStatusChangeRef.current?.(status);
    },
    []
  );

  // Notify parent of estimate changes (ref keeps deps stable)
  useEffect(() => {
    onEstimateChangeRef.current?.(estimate);
  }, [estimate]);

  // Expose save function to parent
  const handleManualSave = useCallback(async () => {
    if (!onSave) {
      return;
    }
    updateSaveStatus("saving");
    try {
      await onSave(estimate);
      updateSaveStatus("saved");
    } catch (err) {
      console.error("Failed to save:", err);
      updateSaveStatus("unsaved");
    }
  }, [onSave, estimate, updateSaveStatus]);

  useEffect(() => {
    onSaveRef?.({ save: handleManualSave });
    return () => onSaveRef?.(null);
  }, [onSaveRef, handleManualSave]);

  // Expose reset function to parent
  useEffect(() => {
    onResetRef?.({ reset: loadEstimate });
    return () => onResetRef?.(null);
  }, [onResetRef, loadEstimate]);

  // Auto-save (debounced) - only save if estimate has meaningful content
  useEffect(() => {
    const hasContent =
      estimate.lineItems.length > 0 ||
      estimate.billTo.companyName.trim() !== "" ||
      estimate.jobInfo.siteName.trim() !== "";

    if (!hasContent) {
      return;
    }

    updateSaveStatus("unsaved");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (onSave) {
        updateSaveStatus("saving");
        try {
          await onSave(estimate);
          updateSaveStatus("saved");
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("Failed to save estimate:", errorMessage, err);
          updateSaveStatus("unsaved");
        }
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [estimate, onSave, updateSaveStatus]);

  const showCompactRows = compactRows;

  // Single-pass grouping: build Map<sectionId, items[]> then derive both lists
  const { unsectioned, sectionGroups } = useMemo(() => {
    const bySection = new Map<string | undefined, EditorLineItem[]>();
    for (const item of estimate.lineItems) {
      const key = item.sectionId || undefined;
      const group = bySection.get(key);
      if (group) {
        group.push(item);
      } else {
        bySection.set(key, [item]);
      }
    }
    return {
      unsectioned: bySection.get(undefined) ?? [],
      sectionGroups: estimate.sections.map((section) => ({
        section,
        items: bySection.get(section.id) ?? [],
      })),
    };
  }, [estimate.lineItems, estimate.sections]);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 pb-28 lg:p-8 lg:pb-8">
      <div className="space-y-6">
        <EstimateHeaderForm
          estimate={estimate}
          updateEstimate={updateEstimate}
        />

        {/* Line Items */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs">
                3
              </span>
              Line Items
            </h3>
            <Button
              className="rounded-lg"
              onClick={addLineItem}
              size="sm"
              variant="secondary"
            >
              <Plus className="mr-1 h-4 w-4" />
              Blank Item
            </Button>
          </div>

          {/* Catalog Picker */}
          <div className="mb-4 rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
              <div className="grid flex-1 gap-2">
                <Label
                  className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  htmlFor="catalogPicker"
                >
                  Add from Catalog
                </Label>
                <CatalogCombobox catalog={catalog} onSelect={addFromCatalog} />
              </div>
              <div className="grid w-full gap-2 sm:w-48">
                <Label
                  className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  htmlFor="sectionPicker"
                >
                  Add Section
                </Label>
                <SectionCombobox
                  catalog={catalog}
                  onSelect={addCategoryItems}
                />
              </div>
            </div>

            {/* Current Sections */}
            {estimate.sections.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-border/30 border-t pt-4">
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Sections:
                </span>
                {estimate.sections.map((section) => (
                  <div
                    className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-primary"
                    key={section.id}
                  >
                    <span className="font-medium text-xs">
                      {section.title || section.name}
                    </span>
                    <Button
                      className="h-4 w-4 rounded-full p-0 text-primary/60 hover:bg-primary/20 hover:text-primary"
                      onClick={() => removeSection(section.id)}
                      size="sm"
                      variant="ghost"
                    >
                      X
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            {/* Table Header */}
            <div
              className={
                showCompactRows
                  ? "mb-2 hidden items-center px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  : "mb-2 hidden items-center px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide md:flex"
              }
            >
              <div className="w-9 shrink-0" />
              <div className="ml-2 min-w-0 flex-[2]">Item</div>
              <div className="ml-2 w-9 shrink-0" />
              <div className="ml-2 min-w-0 flex-[3]">Description</div>
              <div className="ml-2 w-20 text-left">Qty</div>
              <div className="ml-2 w-16 shrink-0 text-center">U/M</div>
              <div className="ml-2 w-24 text-left">Cost</div>
              <div className="ml-2 w-28 shrink-0 text-right">Total</div>
            </div>

            {/* Unsectioned items */}
            {unsectioned.map((item) => (
              <div key={item.id}>
                <EstimateLineItemRow
                  catalog={catalog}
                  compactRows={showCompactRows}
                  item={item}
                  onRemove={removeLineItem}
                  onUpdate={updateLineItem}
                  onUpdateFromCatalog={updateLineItemFromCatalog}
                />
              </div>
            ))}

            {/* Sectioned items */}
            {sectionGroups.map(({ section, items }) => {
              const sectionTotal = items.reduce(
                (sum, item) => sum + item.total,
                0
              );

              return items.length > 0 ? (
                <div
                  className="mt-4 rounded-xl transition-all duration-300"
                  id={`section-${section.id}`}
                  key={section.id}
                >
                  <div className="flex items-center justify-between gap-4 rounded-t-xl border border-border/50 border-b-0 bg-primary/5 px-4 py-2">
                    <Input
                      className="h-7 flex-1 border-0 bg-transparent px-0 font-display font-semibold text-primary text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      onChange={(e) =>
                        updateSectionTitle(section.id, e.target.value)
                      }
                      placeholder={section.name}
                      value={section.title || section.name}
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        className="h-6 px-2 text-primary/60 text-xs hover:bg-primary/10 hover:text-primary"
                        onClick={() => handleDuplicateSection(section.id)}
                        size="sm"
                        title="Duplicate this section"
                        variant="ghost"
                      >
                        Duplicate
                      </Button>
                      <Button
                        className="h-6 w-6 rounded-full p-0 text-primary/60 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeSection(section.id)}
                        size="sm"
                        title="Remove section"
                        variant="ghost"
                      >
                        X
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-b-xl border border-border/50 border-t-0 bg-card/50">
                    {items.map((item) => (
                      <div
                        className="border-border/30 border-b px-2 py-1 last:border-b-0"
                        key={item.id}
                      >
                        <EstimateLineItemRow
                          catalog={catalog}
                          catalogCategoryId={section.catalogCategoryId}
                          compactRows={showCompactRows}
                          item={item}
                          onRemove={removeLineItem}
                          onUpdate={updateLineItem}
                          onUpdateFromCatalog={updateLineItemFromCatalog}
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-end border-border/30 border-t bg-primary/5 px-4 py-2">
                      <span className="mr-4 font-medium text-muted-foreground text-sm">
                        Subtotal:
                      </span>
                      <span className="font-mono font-semibold text-primary">
                        {formatCurrency(sectionTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null;
            })}

            {estimate.lineItems.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 border-dashed bg-muted/10 py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Plus className="h-6 w-6" />
                </div>
                <p className="text-muted-foreground text-sm">
                  No items yet. Use the catalog picker above to add items.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-linear-to-r from-primary/5 to-primary/10 p-5">
          <span className="font-display font-semibold text-lg">Total</span>
          <span className="font-bold font-display text-2xl text-primary">
            {formatCurrency(estimate.total)}
          </span>
        </div>
      </div>
    </div>
  );
}
