"use client";

import { CalendarIcon, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQuoteEditor } from "@/hooks/use-quote-editor";
import type { Catalog, EditorLineItem, EditorQuote } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { CatalogCombobox } from "./catalog-combobox";
import { ItemCombobox } from "./item-combobox";
import { SectionCombobox } from "./section-combobox";

interface InlineQuoteEditorProps {
  catalog: Catalog;
  initialQuote?: EditorQuote;
  onSave?: (quote: EditorQuote) => Promise<void>;
  onSaveStatusChange?: (status: "saved" | "saving" | "unsaved") => void;
  onQuoteChange?: (quote: EditorQuote) => void;
  onSaveRef?: (ref: { save: () => Promise<void> } | null) => void;
  quoteId?: string | null;
}

export function InlineQuoteEditor({
  catalog,
  initialQuote,
  onSave,
  onSaveStatusChange,
  onQuoteChange,
  onSaveRef,
}: InlineQuoteEditorProps) {
  const {
    quote,
    updateQuote,
    updateLineItem,
    updateLineItemFromCatalog,
    addLineItem,
    removeLineItem,
    addFromCatalog,
    addCategoryItems,
    removeSection,
    updateSectionTitle,
    duplicateSection,
  } = useQuoteEditor({ initialQuote, catalog });

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

  // Effect to scroll to new section after it renders
  useEffect(() => {
    if (scrollToSectionRef.current) {
      const targetId = scrollToSectionRef.current;
      // Check if the section exists in the quote
      const sectionExists = quote.sections.some((s) => s.id === targetId);

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
  }, [quote.sections]);

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Notify parent of save status changes
  useEffect(() => {
    onSaveStatusChange?.(saveStatus);
  }, [saveStatus, onSaveStatusChange]);

  useEffect(() => {
    onQuoteChange?.(quote);
  }, [quote, onQuoteChange]);

  // Expose save function to parent
  const handleManualSave = useCallback(async () => {
    if (!onSave) {
      return;
    }
    setSaveStatus("saving");
    try {
      await onSave(quote);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Failed to save:", err);
      setSaveStatus("unsaved");
    }
  }, [onSave, quote]);

  useEffect(() => {
    onSaveRef?.({ save: handleManualSave });
    return () => onSaveRef?.(null);
  }, [onSaveRef, handleManualSave]);

  // Auto-save (debounced) - only save if quote has meaningful content
  useEffect(() => {
    const hasContent =
      quote.lineItems.length > 0 ||
      quote.billTo.companyName.trim() !== "" ||
      quote.jobInfo.siteName.trim() !== "";

    if (!hasContent) {
      return;
    }

    setSaveStatus("unsaved");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (onSave) {
        setSaveStatus("saving");
        try {
          await onSave(quote);
          setSaveStatus("saved");
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("Failed to save quote:", errorMessage, err);
          setSaveStatus("unsaved");
        }
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [quote, onSave]);

  const renderLineItem = useCallback(
    (item: EditorLineItem, catalogCategoryId?: string) => (
      <>
        {/* Desktop view */}
        <div
          className={`hidden items-center md:flex ${item.isStruck ? "opacity-50" : ""}`}
        >
          <Button
            className="h-9 w-9 shrink-0 rounded-lg p-0 transition-transform hover:scale-105"
            onClick={() => removeLineItem(item.id)}
            size="sm"
            variant="destructive"
          >
            X
          </Button>
          <div className="ml-2 min-w-0 flex-[2]">
            <ItemCombobox
              catalog={catalog}
              categoryId={catalogCategoryId}
              currentValue={item.item}
              isStruck={item.isStruck}
              onSelect={(catalogItem) =>
                updateLineItemFromCatalog(item.id, catalogItem)
              }
            />
          </div>
          <Button
            className={cn(
              "ml-2 h-9 w-9 shrink-0 rounded-lg p-0 transition-all",
              item.isStruck && "bg-amber-500 text-white hover:bg-amber-500/80"
            )}
            onClick={() => updateLineItem(item.id, "isStruck", !item.isStruck)}
            size="sm"
            title={
              item.isStruck ? "Remove strikethrough" : "Strikethrough item"
            }
            variant="secondary"
          >
            <span className="line-through">S</span>
          </Button>
          <Input
            className={cn(
              "ml-2 h-9 min-w-0 flex-[3] rounded-lg border-border/50 bg-background text-sm transition-colors focus:border-primary",
              item.isStruck && "line-through"
            )}
            onChange={(e) =>
              updateLineItem(item.id, "description", e.target.value)
            }
            value={item.description}
          />
          <Input
            className="ml-2 h-9 w-20 rounded-lg border-border/50 bg-background text-sm transition-colors focus:border-primary"
            onChange={(e) =>
              updateLineItem(
                item.id,
                "qty",
                Number.parseFloat(e.target.value) || 0
              )
            }
            type="number"
            value={item.qty}
          />
          <div className="ml-2 flex h-9 w-16 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/50 text-muted-foreground text-xs">
            {item.uom}
          </div>
          <Input
            className="ml-2 h-9 w-24 rounded-lg border-border/50 bg-background text-left text-sm transition-colors focus:border-primary"
            onChange={(e) =>
              updateLineItem(
                item.id,
                "cost",
                Number.parseFloat(e.target.value) || 0
              )
            }
            step="0.01"
            type="number"
            value={item.cost}
          />
          <div className="ml-2 flex h-9 w-28 shrink-0 items-center justify-end font-medium font-mono text-sm">
            {formatCurrency(item.total)}
          </div>
        </div>

        {/* Mobile view */}
        <div className="space-y-2 rounded-xl border border-border/50 bg-card p-4 shadow-sm md:hidden">
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Item
            </span>
            <div className="flex gap-2">
              <Button
                className={cn(
                  "h-8 w-8 rounded-lg p-0",
                  item.isStruck &&
                    "bg-amber-500 text-white hover:bg-amber-500/80"
                )}
                onClick={() =>
                  updateLineItem(item.id, "isStruck", !item.isStruck)
                }
                size="sm"
                variant="secondary"
              >
                <span className="line-through">S</span>
              </Button>
              <Button
                className="h-8 w-8 rounded-lg p-0"
                onClick={() => removeLineItem(item.id)}
                size="sm"
                variant="destructive"
              >
                X
              </Button>
            </div>
          </div>
          <ItemCombobox
            catalog={catalog}
            categoryId={catalogCategoryId}
            className="h-10"
            currentValue={item.item}
            isStruck={item.isStruck}
            onSelect={(catalogItem) =>
              updateLineItemFromCatalog(item.id, catalogItem)
            }
          />
          <Input
            className="h-10 rounded-lg border-border/50 bg-background text-sm"
            onChange={(e) =>
              updateLineItem(item.id, "description", e.target.value)
            }
            placeholder="Description"
            value={item.description}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              className="h-10 rounded-lg border-border/50 bg-background text-sm"
              inputMode="decimal"
              onChange={(e) =>
                updateLineItem(
                  item.id,
                  "qty",
                  Number.parseFloat(e.target.value) || 0
                )
              }
              placeholder="Qty"
              type="number"
              value={item.qty}
            />
            <Input
              className="h-10 rounded-lg border-border/50 bg-background text-sm"
              onChange={(e) => updateLineItem(item.id, "uom", e.target.value)}
              placeholder="U/M"
              value={item.uom}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              className="h-10 rounded-lg border-border/50 bg-background text-sm"
              inputMode="decimal"
              onChange={(e) =>
                updateLineItem(
                  item.id,
                  "cost",
                  Number.parseFloat(e.target.value) || 0
                )
              }
              placeholder="Cost"
              step="0.01"
              type="number"
              value={item.cost}
            />
            <div className="flex h-10 items-center justify-end font-mono font-semibold text-sm">
              {formatCurrency(item.total)}
            </div>
          </div>
        </div>
      </>
    ),
    [catalog, removeLineItem, updateLineItem, updateLineItemFromCatalog]
  );

  const unsectioned = quote.lineItems.filter((i) => !i.sectionId);
  const sectionGroups = quote.sections.map((section) => ({
    section,
    items: quote.lineItems.filter((i) => i.sectionId === section.id),
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 pb-28 lg:p-8 lg:pb-8">
      <div className="space-y-6">
        {/* Header Info */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-2">
            <Label
              className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="estimator"
            >
              Estimator
            </Label>
            <Input
              className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
              id="estimator"
              onChange={(e) =>
                updateQuote((p) => ({ ...p, estimator: e.target.value }))
              }
              placeholder="Estimator name"
              value={quote.estimator}
            />
          </div>
          <div className="grid gap-2">
            <Label
              className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="date"
            >
              Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  className="h-10 w-full justify-between rounded-lg border-border/50 bg-background font-normal transition-colors hover:border-primary"
                  variant="outline"
                >
                  <span>
                    {new Date(quote.date).toLocaleDateString("en-US", {
                      month: "2-digit",
                      day: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  defaultMonth={new Date(quote.date)}
                  mode="single"
                  onSelect={(date) => {
                    if (date) {
                      updateQuote((p) => ({
                        ...p,
                        date: date.toISOString(),
                      }));
                    }
                  }}
                  selected={new Date(quote.date)}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-2">
            <Label
              className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="estimateNumber"
            >
              Estimate #
            </Label>
            <Input
              className="h-10 rounded-lg border-border/50 bg-background font-mono transition-colors focus:border-primary"
              id="estimateNumber"
              onChange={(e) =>
                updateQuote((p) => ({ ...p, estimateNumber: e.target.value }))
              }
              value={quote.estimateNumber}
            />
          </div>
        </div>

        {/* Bill To and Job Info */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Bill To */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
            <h3 className="mb-4 flex items-center gap-2 font-display font-semibold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs">
                1
              </span>
              Bill To
            </h3>
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label
                  className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  htmlFor="companyName"
                >
                  Company Name
                </Label>
                <Input
                  className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
                  id="companyName"
                  onChange={(e) =>
                    updateQuote((p) => ({
                      ...p,
                      billTo: { ...p.billTo, companyName: e.target.value },
                    }))
                  }
                  placeholder="Company name"
                  value={quote.billTo.companyName}
                />
              </div>
              <div className="grid gap-2">
                <Label
                  className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  htmlFor="companyAddress"
                >
                  Company Address
                </Label>
                <Input
                  className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
                  id="companyAddress"
                  onChange={(e) =>
                    updateQuote((p) => ({
                      ...p,
                      billTo: { ...p.billTo, address: e.target.value },
                    }))
                  }
                  placeholder="Enter company address..."
                  value={quote.billTo.address}
                />
              </div>
            </div>
          </div>

          {/* Job Info */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
            <h3 className="mb-4 flex items-center gap-2 font-display font-semibold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs">
                2
              </span>
              Job Information
            </h3>
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label
                  className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  htmlFor="jobName"
                >
                  Job Name
                </Label>
                <Input
                  className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
                  id="jobName"
                  onChange={(e) =>
                    updateQuote((p) => ({
                      ...p,
                      jobInfo: { ...p.jobInfo, siteName: e.target.value },
                    }))
                  }
                  placeholder="Job name"
                  value={quote.jobInfo.siteName}
                />
              </div>
              <div className="grid gap-2">
                <Label
                  className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  htmlFor="jobAddress"
                >
                  Job Address
                </Label>
                <Input
                  className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
                  id="jobAddress"
                  onChange={(e) =>
                    updateQuote((p) => ({
                      ...p,
                      jobInfo: { ...p.jobInfo, address: e.target.value },
                    }))
                  }
                  placeholder="Enter job address..."
                  value={quote.jobInfo.address}
                />
              </div>
            </div>
          </div>
        </div>

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
            {quote.sections.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-border/30 border-t pt-4">
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Sections:
                </span>
                {quote.sections.map((section) => (
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
            <div className="mb-2 hidden items-center px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide md:flex">
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
              <div key={item.id}>{renderLineItem(item, undefined)}</div>
            ))}

            {/* Sectioned items */}
            {sectionGroups.map(({ section, items }) => {
              const sectionTotal = items
                .filter((item) => !item.isStruck)
                .reduce((sum, item) => sum + item.total, 0);

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
                        {renderLineItem(item, section.catalogCategoryId)}
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

            {quote.lineItems.length === 0 && (
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
            {formatCurrency(quote.total)}
          </span>
        </div>
      </div>
    </div>
  );
}
