"use client";

import {
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  FolderPlus,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { QuotePDFPreview } from "@/components/quotes/quote-pdf-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type {
  CatalogItem,
  Quote,
  QuoteLineItem,
  QuoteSection,
  QuoteVersion,
} from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

interface QuoteEditorProps {
  quote: Quote;
  currentVersion: QuoteVersion;
  sections: QuoteSection[];
  lineItems: QuoteLineItem[];
  catalogItems: CatalogItem[];
}

export function QuoteEditor({
  quote: initialQuote,
  currentVersion,
  sections: initialSections,
  lineItems: initialLineItems,
  catalogItems,
}: QuoteEditorProps) {
  const router = useRouter();
  const [quote] = useState(initialQuote);
  const [sections, setSections] = useState(initialSections);
  const [lineItems, setLineItems] = useState(initialLineItems);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.map((s) => s.id))
  );
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<string>("");
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Header fields (local state for now)
  const [estimatorName, setEstimatorName] = useState("");
  const [quoteDate, setQuoteDate] = useState<Date>(new Date());

  // Bill To fields
  const [companyName, setCompanyName] = useState(initialQuote.client_name || "");
  const [companyAddress, setCompanyAddress] = useState("");

  // Job Info fields
  const [jobName, setJobName] = useState(initialQuote.job_name || "");
  const [jobAddress, setJobAddress] = useState(initialQuote.job_address || "");

  const catalogByCategory = useMemo(() => {
    const grouped: Record<string, CatalogItem[]> = {};
    for (const item of catalogItems) {
      const category = item.category || "Uncategorized";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    }
    return grouped;
  }, [catalogItems]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let cost = 0;

    for (const item of lineItems) {
      if (!item.is_excluded) {
        const itemTotal = item.quantity * item.unit_price;
        const itemCost = item.quantity * item.unit_cost;
        subtotal += itemTotal;
        cost += itemCost;
      }
    }

    const margin = subtotal - cost;
    const marginPercent = subtotal > 0 ? (margin / subtotal) * 100 : 0;

    return { subtotal, cost, margin, marginPercent };
  }, [lineItems]);

  const itemsBySection = useMemo(() => {
    const grouped: Record<string, QuoteLineItem[]> = { unsectioned: [] };
    for (const s of sections) {
      grouped[s.id] = [];
    }
    for (const item of lineItems) {
      if (item.section_id && grouped[item.section_id]) {
        grouped[item.section_id].push(item);
      } else {
        grouped.unsectioned.push(item);
      }
    }
    return grouped;
  }, [sections, lineItems]);

  const sectionSubtotals = useMemo(() => {
    const subtotals: Record<string, number> = {};
    for (const section of sections) {
      const sectionItems = itemsBySection[section.id] || [];
      subtotals[section.id] = sectionItems
        .filter((i) => !i.is_excluded)
        .reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    }
    return subtotals;
  }, [sections, itemsBySection]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleAddSection = async () => {
    if (!newSectionName.trim()) {
      return;
    }

    const supabase = createClient();
    const maxOrder = Math.max(0, ...sections.map((s) => s.sort_order));

    const { data, error } = await supabase
      .from("quote_sections")
      .insert({
        version_id: currentVersion.id,
        name: newSectionName.trim(),
        sort_order: maxOrder + 1,
      })
      .select()
      .single();

    if (!error && data) {
      setSections([...sections, data]);
      setExpandedSections((prev) => new Set([...prev, data.id]));
    }

    setNewSectionName("");
    setAddSectionOpen(false);
  };

  const handleDeleteSection = async (sectionId: string) => {
    const supabase = createClient();

    const itemsToMove = lineItems.filter((i) => i.section_id === sectionId);
    if (itemsToMove.length > 0) {
      await supabase
        .from("quote_line_items")
        .update({ section_id: null })
        .eq("section_id", sectionId);
      setLineItems(
        lineItems.map((i) =>
          i.section_id === sectionId ? { ...i, section_id: null } : i
        )
      );
    }

    const { error } = await supabase
      .from("quote_sections")
      .delete()
      .eq("id", sectionId);
    if (!error) {
      setSections(sections.filter((s) => s.id !== sectionId));
    }
  };

  const handleAddLineItem = async () => {
    if (!selectedCatalogItem) {
      return;
    }

    const supabase = createClient();
    const catalogItem = catalogItems.find((c) => c.id === selectedCatalogItem);
    if (!catalogItem) {
      return;
    }

    const maxOrder = Math.max(
      0,
      ...lineItems
        .filter((i) => i.section_id === targetSectionId)
        .map((i) => i.sort_order)
    );

    const { data, error } = await supabase
      .from("quote_line_items")
      .insert({
        version_id: currentVersion.id,
        section_id: targetSectionId,
        description: catalogItem.description,
        quantity: 1,
        unit: catalogItem.default_unit,
        unit_cost: catalogItem.default_unit_cost,
        unit_price: catalogItem.default_unit_price,
        is_excluded: false,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();

    if (!error && data) {
      setLineItems([...lineItems, data]);
    }

    setSelectedCatalogItem("");
    setTargetSectionId(null);
    setAddItemOpen(false);
  };

  const handleUpdateLineItem = useCallback(
    async (itemId: string, updates: Partial<QuoteLineItem>) => {
      const supabase = createClient();

      setLineItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
      );

      const { error } = await supabase
        .from("quote_line_items")
        .update(updates)
        .eq("id", itemId);

      if (error) {
        setLineItems((prev) =>
          prev.map((i) => {
            if (i.id === itemId) {
              const original = lineItems.find((li) => li.id === itemId);
              return original ?? i;
            }
            return i;
          })
        );
      }
    },
    [lineItems]
  );

  const handleDeleteLineItem = async (itemId: string) => {
    const supabase = createClient();

    const { error } = await supabase
      .from("quote_line_items")
      .delete()
      .eq("id", itemId);

    if (!error) {
      setLineItems(lineItems.filter((i) => i.id !== itemId));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const supabase = createClient();

    await supabase
      .from("quote_versions")
      .update({ total: totals.subtotal })
      .eq("id", currentVersion.id);

    setIsSaving(false);
    router.refresh();
  };

  const openAddItem = (sectionId: string | null) => {
    setTargetSectionId(sectionId);
    setAddItemOpen(true);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className={cn(
          "flex flex-1 flex-col gap-6 overflow-y-auto p-6",
          showPreview && "lg:w-1/2"
        )}
      >
        {/* Quote Editor Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>Quote Editor</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">v{currentVersion.version_number}</Badge>
                <Badge variant={quote.is_locked ? "secondary" : "outline"}>
                  {quote.is_locked ? "Locked" : "Draft"}
                </Badge>
                <Button
                  onClick={() => setShowPreview(!showPreview)}
                  size="sm"
                  variant="outline"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {showPreview ? "Hide" : "Preview"}
                </Button>
                <Button disabled={isSaving} onClick={handleSave} size="sm">
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Header Row: Estimator, Date, Estimate # */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Estimator</Label>
                <Input
                  className="h-8 text-sm"
                  onChange={(e) => setEstimatorName(e.target.value)}
                  placeholder="Estimator name"
                  value={estimatorName}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      className="h-8 w-full justify-between text-sm font-normal"
                      variant="outline"
                    >
                      {quoteDate.toLocaleDateString("en-US", {
                        month: "2-digit",
                        day: "2-digit",
                        year: "numeric",
                      })}
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      defaultMonth={quoteDate}
                      mode="single"
                      onSelect={(date) => date && setQuoteDate(date)}
                      selected={quoteDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Estimate #</Label>
                <Input
                  className="h-8 text-sm"
                  disabled
                  value={quote.base_number}
                />
              </div>
            </div>

            {/* Bill To and Job Info - Side by Side */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* Bill To */}
              <div className="rounded border p-3">
                <h4 className="mb-2 border-b pb-1 text-sm font-semibold">Bill To:</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Company Name</Label>
                    <Input
                      className="h-8 text-sm"
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company name"
                      value={companyName}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Address</Label>
                    <Input
                      className="h-8 text-sm"
                      onChange={(e) => setCompanyAddress(e.target.value)}
                      placeholder="Company address"
                      value={companyAddress}
                    />
                  </div>
                </div>
              </div>

              {/* Job Info */}
              <div className="rounded border p-3">
                <h4 className="mb-2 border-b pb-1 text-sm font-semibold">Job Information:</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Job Name</Label>
                    <Input
                      className="h-8 text-sm"
                      onChange={(e) => setJobName(e.target.value)}
                      placeholder="Job name"
                      value={jobName}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Address</Label>
                    <Input
                      className="h-8 text-sm"
                      onChange={(e) => setJobAddress(e.target.value)}
                      placeholder="Job address"
                      value={jobAddress}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items Section */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Line Items</h3>
            <div className="flex gap-2">
              <Dialog onOpenChange={setAddSectionOpen} open={addSectionOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <FolderPlus className="mr-2 h-4 w-4" />
                    Add Section
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Section</DialogTitle>
                    <DialogDescription>
                      Create a new section to organize line items
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="section-name">Section Name</Label>
                      <Input
                        id="section-name"
                        onChange={(e) => setNewSectionName(e.target.value)}
                        placeholder="e.g., Erosion Control"
                        value={newSectionName}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => setAddSectionOpen(false)}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleAddSection}>Add Section</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                onClick={() => openAddItem(null)}
                size="sm"
                variant="secondary"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>
          </div>

          <div className="space-y-3">
          {itemsBySection.unsectioned.length > 0 && (
            <Card>
              <CardHeader className="p-4">
                <CardTitle className="font-medium text-muted-foreground text-sm">
                  Unsectioned Items
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <LineItemTable
                  items={itemsBySection.unsectioned}
                  onDelete={handleDeleteLineItem}
                  onUpdate={handleUpdateLineItem}
                />
              </CardContent>
            </Card>
          )}

          {sections.map((section) => (
            <Card key={section.id}>
              <CardHeader className="p-4">
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-2 text-left"
                    onClick={() => toggleSection(section.id)}
                    type="button"
                  >
                    {expandedSections.has(section.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <CardTitle className="text-base">{section.name}</CardTitle>
                    <Badge className="ml-2" variant="secondary">
                      {itemsBySection[section.id]?.length || 0} items
                    </Badge>
                    <span className="ml-2 text-muted-foreground text-sm">
                      {formatCurrency(sectionSubtotals[section.id] || 0)}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => openAddItem(section.id)}
                      size="sm"
                      variant="ghost"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="h-8 w-8" size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openAddItem(section.id)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Item
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDeleteSection(section.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Section
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              {expandedSections.has(section.id) && (
                <CardContent className="p-0">
                  {itemsBySection[section.id]?.length > 0 ? (
                    <LineItemTable
                      items={itemsBySection[section.id]}
                      onDelete={handleDeleteLineItem}
                      onUpdate={handleUpdateLineItem}
                    />
                  ) : (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No items in this section.{" "}
                      <button
                        className="underline"
                        onClick={() => openAddItem(section.id)}
                        type="button"
                      >
                        Add one
                      </button>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}

          {sections.length === 0 && lineItems.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="font-semibold text-lg">No line items yet</h3>
                <p className="mb-4 text-muted-foreground text-sm">
                  Get started by adding a section or line item.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setAddSectionOpen(true)}
                    variant="outline"
                  >
                    <FolderPlus className="mr-2 h-4 w-4" />
                    Add Section
                  </Button>
                  <Button onClick={() => openAddItem(null)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          </div>
        </div>

        {/* Totals */}
        <div className="flex items-center justify-between rounded border bg-muted/50 p-4">
          <div className="flex gap-6">
            <div>
              <p className="text-muted-foreground text-xs">Subtotal</p>
              <p className="font-semibold text-lg">{formatCurrency(totals.subtotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Cost</p>
              <p className="text-muted-foreground">{formatCurrency(totals.cost)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Margin</p>
              <p className={cn(totals.margin >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(totals.margin)} ({totals.marginPercent.toFixed(1)}%)
              </p>
            </div>
          </div>
        </div>

        <Dialog onOpenChange={setAddItemOpen} open={addItemOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Line Item</DialogTitle>
              <DialogDescription>
                Select an item from the catalog or create a custom one
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Catalog Item</Label>
                <Select
                  onValueChange={setSelectedCatalogItem}
                  value={selectedCatalogItem}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(catalogByCategory).map(
                      ([category, items]) => (
                        <div key={category}>
                          <div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                            {category}
                          </div>
                          {items.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.description} ({item.default_unit})
                            </SelectItem>
                          ))}
                        </div>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setAddItemOpen(false)} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={!selectedCatalogItem}
                onClick={handleAddLineItem}
              >
                Add Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {showPreview && (
        <div className="hidden border-l bg-muted/30 lg:flex lg:w-1/2 lg:flex-col">
          <div className="flex items-center justify-between border-b bg-background px-4 py-2">
            <h3 className="font-medium">PDF Preview</h3>
            <div className="flex items-center gap-2">
              <Button disabled size="sm" variant="ghost">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                className="h-8 w-8"
                onClick={() => setShowPreview(false)}
                size="icon"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <QuotePDFPreview
              lineItems={lineItems}
              quote={quote}
              sections={sections}
              total={totals.subtotal}
              version={currentVersion}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface LineItemTableProps {
  items: QuoteLineItem[];
  onUpdate: (id: string, updates: Partial<QuoteLineItem>) => void;
  onDelete: (id: string) => void;
}

function LineItemTable({ items, onUpdate, onDelete }: LineItemTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-8 p-2" />
            <th className="p-2 text-left font-medium">Description</th>
            <th className="w-24 p-2 text-right font-medium">Qty</th>
            <th className="w-20 p-2 text-center font-medium">Unit</th>
            <th className="w-28 p-2 text-right font-medium">Unit Cost</th>
            <th className="w-28 p-2 text-right font-medium">Unit Price</th>
            <th className="w-28 p-2 text-right font-medium">Total</th>
            <th className="w-12 p-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <LineItemRow
              item={item}
              key={item.id}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LineItemRowProps {
  item: QuoteLineItem;
  onUpdate: (id: string, updates: Partial<QuoteLineItem>) => void;
  onDelete: (id: string) => void;
}

function LineItemRow({ item, onUpdate, onDelete }: LineItemRowProps) {
  const total = item.quantity * item.unit_price;

  return (
    <tr
      className={cn(
        "group border-b hover:bg-muted/30",
        item.is_excluded && "opacity-50"
      )}
    >
      <td className="p-2">
        <div className="flex items-center gap-1">
          <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100" />
          <Checkbox
            checked={!item.is_excluded}
            onCheckedChange={(checked) =>
              onUpdate(item.id, { is_excluded: !checked })
            }
          />
        </div>
      </td>
      <td className="p-2">
        <Input
          className={cn(
            "h-8 border-transparent bg-transparent hover:border-input focus:border-input",
            item.is_excluded && "line-through"
          )}
          onChange={(e) => onUpdate(item.id, { description: e.target.value })}
          value={item.description}
        />
      </td>
      <td className="p-2">
        <Input
          className="h-8 w-full border-transparent bg-transparent text-right hover:border-input focus:border-input"
          onChange={(e) =>
            onUpdate(item.id, {
              quantity: Number.parseFloat(e.target.value) || 0,
            })
          }
          step="0.01"
          type="number"
          value={item.quantity}
        />
      </td>
      <td className="p-2">
        <Input
          className="h-8 w-full border-transparent bg-transparent text-center hover:border-input focus:border-input"
          onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
          value={item.unit}
        />
      </td>
      <td className="p-2">
        <Input
          className="h-8 w-full border-transparent bg-transparent text-right hover:border-input focus:border-input"
          onChange={(e) =>
            onUpdate(item.id, {
              unit_cost: Number.parseFloat(e.target.value) || 0,
            })
          }
          step="0.01"
          type="number"
          value={item.unit_cost}
        />
      </td>
      <td className="p-2">
        <Input
          className="h-8 w-full border-transparent bg-transparent text-right hover:border-input focus:border-input"
          onChange={(e) =>
            onUpdate(item.id, {
              unit_price: Number.parseFloat(e.target.value) || 0,
            })
          }
          step="0.01"
          type="number"
          value={item.unit_price}
        />
      </td>
      <td className="p-2 text-right font-mono">{formatCurrency(total)}</td>
      <td className="p-2">
        <Button
          className="h-8 w-8 opacity-0 group-hover:opacity-100"
          onClick={() => onDelete(item.id)}
          size="icon"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}
