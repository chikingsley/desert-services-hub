"use client";

import {
  ChevronDown,
  ChevronRight,
  Link2,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CatalogItemData, CategoryData } from "./catalog-content";

export interface BundleItem {
  id: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  isRequired: boolean;
  quantityMultiplier: number;
  sortOrder: number;
}

export interface Bundle {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  toolType: "count" | "linear" | "area";
  color: string;
  isActive: boolean;
  sortOrder: number;
  items: BundleItem[];
}

interface BundlesSectionProps {
  bundles: Bundle[];
  categories: CategoryData[];
  onBundlesChange: (bundles: Bundle[]) => void;
}

const TOOL_TYPES = [
  { value: "count", label: "Count (click to place)" },
  { value: "linear", label: "Linear (draw polyline)" },
  { value: "area", label: "Area (draw polygon)" },
];

const UNITS = [
  { value: "Each", label: "Each" },
  { value: "LF", label: "Linear Feet (LF)" },
  { value: "SF", label: "Square Feet (SF)" },
];

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
];

export function BundlesSection({
  bundles,
  categories,
  onBundlesChange,
}: BundlesSectionProps) {
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(
    new Set(bundles.map((b) => b.id))
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);

  // Form state for new bundle
  const [newBundleName, setNewBundleName] = useState("");
  const [newBundleDescription, setNewBundleDescription] = useState("");
  const [newBundleUnit, setNewBundleUnit] = useState("LF");
  const [newBundleToolType, setNewBundleToolType] = useState<
    "count" | "linear" | "area"
  >("linear");
  const [newBundleColor, setNewBundleColor] = useState(COLORS[1]);

  // Item picker state
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [bundleToDeleteId, setBundleToDeleteId] = useState<string | null>(null);

  const toggleBundle = (bundleId: string) => {
    setExpandedBundles((prev) => {
      const next = new Set(prev);
      if (next.has(bundleId)) {
        next.delete(bundleId);
      } else {
        next.add(bundleId);
      }
      return next;
    });
  };

  const handleCreateBundle = async () => {
    if (!newBundleName.trim()) {
      return;
    }

    try {
      const res = await fetch("/api/catalog/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBundleName.trim(),
          description: newBundleDescription.trim() || null,
          unit: newBundleUnit,
          toolType: newBundleToolType,
          color: newBundleColor,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create bundle");
      }

      const newBundle = await res.json();
      onBundlesChange([...bundles, newBundle]);
      setExpandedBundles((prev) => new Set([...prev, newBundle.id]));

      // Reset form
      setNewBundleName("");
      setNewBundleDescription("");
      setNewBundleUnit("LF");
      setNewBundleToolType("linear");
      setNewBundleColor(COLORS[1]);
      setCreateDialogOpen(false);
    } catch (error) {
      console.error("Error creating bundle:", error);
    }
  };

  const handleDeleteBundle = (bundleId: string) => {
    setBundleToDeleteId(bundleId);
  };

  const confirmDeleteBundle = async () => {
    if (!bundleToDeleteId) {
      return;
    }

    try {
      const res = await fetch(`/api/catalog/bundles/${bundleToDeleteId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete bundle");
      }

      onBundlesChange(bundles.filter((b) => b.id !== bundleToDeleteId));
    } catch (error) {
      console.error("Error deleting bundle:", error);
    } finally {
      setBundleToDeleteId(null);
    }
  };

  const handleAddItemToBundle = async (itemId: string) => {
    if (!selectedBundle) {
      return;
    }

    try {
      const res = await fetch(
        `/api/catalog/bundles/${selectedBundle.id}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, isRequired: true }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to add item");
      }

      const newItem = await res.json();

      onBundlesChange(
        bundles.map((b) =>
          b.id === selectedBundle.id
            ? { ...b, items: [...b.items, newItem] }
            : b
        )
      );
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const handleRemoveItemFromBundle = async (
    bundleId: string,
    itemId: string
  ) => {
    try {
      const res = await fetch(
        `/api/catalog/bundles/${bundleId}/items?itemId=${itemId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        throw new Error("Failed to remove item");
      }

      onBundlesChange(
        bundles.map((b) =>
          b.id === bundleId
            ? { ...b, items: b.items.filter((i) => i.itemId !== itemId) }
            : b
        )
      );
    } catch (error) {
      console.error("Error removing item:", error);
    }
  };

  const handleToggleItemRequired = async (
    bundleId: string,
    itemId: string,
    isRequired: boolean
  ) => {
    try {
      const res = await fetch(`/api/catalog/bundles/${bundleId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, isRequired }),
      });

      if (!res.ok) {
        throw new Error("Failed to update item");
      }

      onBundlesChange(
        bundles.map((b) =>
          b.id === bundleId
            ? {
                ...b,
                items: b.items.map((i) =>
                  i.itemId === itemId ? { ...i, isRequired } : i
                ),
              }
            : b
        )
      );
    } catch (error) {
      console.error("Error updating item:", error);
    }
  };

  // Get all items for the picker
  const getAllItems = useCallback((): CatalogItemData[] => {
    const items: CatalogItemData[] = [];
    for (const category of categories) {
      items.push(...category.items);
      for (const subcat of category.subcategories) {
        items.push(...subcat.items);
      }
    }
    return items;
  }, [categories]);

  const filteredItems = getAllItems().filter((item) => {
    if (!itemSearchQuery) {
      return true;
    }
    const query = itemSearchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.code.toLowerCase().includes(query)
    );
  });

  // Filter out items already in bundle
  const availableItems = selectedBundle
    ? filteredItems.filter(
        (item) => !selectedBundle.items.some((bi) => bi.itemId === item.id)
      )
    : filteredItems;

  const bundleToDelete = bundles.find((b) => b.id === bundleToDeleteId) || null;

  return (
    <div className="mt-8">
      {/* Section Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Takeoff Bundles</h2>
          <span className="text-muted-foreground text-sm">
            ({bundles.length})
          </span>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          New Bundle
        </Button>
      </div>

      <p className="mb-4 text-muted-foreground text-sm">
        Bundles group catalog items together. When measured on a takeoff, all
        items in the bundle are added to the quote.
      </p>

      {/* Bundle Cards */}
      {bundles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Package className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No bundles yet</p>
            <Button
              className="mt-4"
              onClick={() => setCreateDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              Create your first bundle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bundles.map((bundle) => (
            <Card key={bundle.id}>
              <Collapsible
                onOpenChange={() => toggleBundle(bundle.id)}
                open={expandedBundles.has(bundle.id)}
              >
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CollapsibleTrigger className="flex flex-1 items-center gap-2">
                      {expandedBundles.has(bundle.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: bundle.color }}
                      />
                      <CardTitle className="text-base">{bundle.name}</CardTitle>
                      <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                        {bundle.unit} • {bundle.toolType}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        ({bundle.items.length} items)
                      </span>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => {
                          setSelectedBundle(bundle);
                          setAddItemDialogOpen(true);
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteBundle(bundle.id)}
                        size="sm"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {bundle.description && (
                      <p className="mb-3 text-muted-foreground text-sm">
                        {bundle.description}
                      </p>
                    )}
                    {bundle.items.length === 0 ? (
                      <p className="py-4 text-center text-muted-foreground text-sm">
                        No items in this bundle.{" "}
                        <button
                          className="text-primary underline"
                          onClick={() => {
                            setSelectedBundle(bundle);
                            setAddItemDialogOpen(true);
                          }}
                          type="button"
                        >
                          Add items
                        </button>
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {bundle.items.map((item) => (
                          <div
                            className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                            key={item.id}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={item.isRequired}
                                onCheckedChange={(checked) =>
                                  handleToggleItemRequired(
                                    bundle.id,
                                    item.itemId,
                                    checked === true
                                  )
                                }
                              />
                              <div>
                                <p className="font-medium text-sm">
                                  <span className="text-muted-foreground">
                                    {item.code}
                                  </span>{" "}
                                  {item.name}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {item.isRequired ? "Required" : "Optional"} •
                                  ${item.price}/{item.unit}
                                </p>
                              </div>
                            </div>
                            <Button
                              onClick={() =>
                                handleRemoveItemFromBundle(
                                  bundle.id,
                                  item.itemId
                                )
                              }
                              size="sm"
                              variant="ghost"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* Create Bundle Dialog */}
      <Dialog onOpenChange={setCreateDialogOpen} open={createDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Takeoff Bundle</DialogTitle>
            <DialogDescription>
              Create a bundle to group catalog items that should be added
              together when measured on a takeoff.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                onChange={(e) => setNewBundleName(e.target.value)}
                placeholder="e.g., Temporary Fencing"
                value={newBundleName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                onChange={(e) => setNewBundleDescription(e.target.value)}
                placeholder="Optional description"
                value={newBundleDescription}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Measurement Unit</Label>
                <Select onValueChange={setNewBundleUnit} value={newBundleUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tool Type</Label>
                <Select
                  onValueChange={(v) =>
                    setNewBundleToolType(v as "count" | "linear" | "area")
                  }
                  value={newBundleToolType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOOL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform",
                      newBundleColor === color
                        ? "scale-110 border-foreground"
                        : "border-transparent hover:scale-105"
                    )}
                    key={color}
                    onClick={() => setNewBundleColor(color)}
                    style={{ backgroundColor: color }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setCreateDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!newBundleName.trim()}
              onClick={handleCreateBundle}
            >
              Create Bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog onOpenChange={setAddItemDialogOpen} open={addItemDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Add Items to {selectedBundle?.name}</DialogTitle>
            <DialogDescription>
              Select catalog items to include in this bundle.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              className="mb-4"
              onChange={(e) => setItemSearchQuery(e.target.value)}
              placeholder="Search items..."
              value={itemSearchQuery}
            />
            <div className="max-h-[400px] space-y-1 overflow-y-auto">
              {availableItems.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground text-sm">
                  No items available
                </p>
              ) : (
                availableItems.slice(0, 50).map((item) => (
                  <button
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted"
                    key={item.id}
                    onClick={() => handleAddItemToBundle(item.id)}
                    type="button"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        <span className="text-muted-foreground">
                          {item.code}
                        </span>{" "}
                        {item.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        ${item.price}/{item.unit}
                      </p>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setAddItemDialogOpen(false)}
              variant="outline"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open: boolean) => {
          if (!open) {
            setBundleToDeleteId(null);
          }
        }}
        open={Boolean(bundleToDeleteId)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bundle</AlertDialogTitle>
            <AlertDialogDescription>
              {bundleToDelete
                ? `Remove "${bundleToDelete.name}" and its items? This can’t be undone.`
                : "Remove this bundle and its items? This can’t be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteBundle}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
