"use client";

import { Crosshair } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UnitCombobox } from "./unit-combobox";

// Units that support takeoff measurement
const TAKEOFF_UNITS = ["Each", "EA", "LF", "SF"];

interface ItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  subcategoryId?: string;
  parentName: string;
  supportsTakeoff?: boolean;
  item?: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    price: number;
    unit: string;
    notes: string | null;
    defaultQty: number;
    isTakeoffItem?: boolean;
  };
  onSave: (data: {
    code: string;
    name: string;
    description: string | null;
    price: number;
    unit: string;
    notes: string | null;
    defaultQty: number;
    isTakeoffItem?: boolean;
  }) => Promise<void>;
}

export function ItemDialog({
  open,
  onOpenChange,
  categoryId: _categoryId,
  subcategoryId: _subcategoryId,
  parentName,
  supportsTakeoff,
  item,
  onSave,
}: ItemDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [unit, setUnit] = useState("Each");
  const [notes, setNotes] = useState("");
  const [defaultQty, setDefaultQty] = useState("1");
  const [isTakeoffItem, setIsTakeoffItem] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isEdit = !!item;

  // Determine if takeoff toggle should be shown
  const canBeTakeoffItem = supportsTakeoff && TAKEOFF_UNITS.includes(unit);

  // Reset form when dialog opens or item changes
  useEffect(() => {
    if (open) {
      setCode(item?.code || "");
      setName(item?.name || "");
      setDescription(item?.description || "");
      setPrice(item?.price?.toString() || "0");
      setUnit(item?.unit || "Each");
      setNotes(item?.notes || "");
      setDefaultQty(item?.defaultQty?.toString() || "1");
      setIsTakeoffItem(item?.isTakeoffItem ?? false);
    }
  }, [open, item]);

  // Reset isTakeoffItem if unit changes to non-takeoff unit
  useEffect(() => {
    if (!TAKEOFF_UNITS.includes(unit)) {
      setIsTakeoffItem(false);
    }
  }, [unit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(code.trim() && name.trim())) {
      return;
    }

    setIsLoading(true);
    try {
      await onSave({
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        price: Number.parseFloat(price) || 0,
        unit: unit.trim() || "Each",
        notes: notes.trim() || null,
        defaultQty: Number.parseFloat(defaultQty) || 1,
        isTakeoffItem: canBeTakeoffItem ? isTakeoffItem : false,
      });
      onOpenChange(false);
      // Reset form
      setCode("");
      setName("");
      setDescription("");
      setPrice("0");
      setUnit("Each");
      setNotes("");
      setDefaultQty("1");
      setIsTakeoffItem(false);
    } catch (error) {
      console.error("Error saving item:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to get button text without nested ternary
  const getButtonText = () => {
    if (isLoading) {
      return "Saving...";
    }
    if (isEdit) {
      return "Update";
    }
    return "Create";
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display">
              {isEdit ? "Edit Item" : "Add Item"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Update item in "${parentName}".`
                : `Create a new item in "${parentName}".`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  autoFocus
                  id="code"
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="SWPPP-001"
                  value={code}
                />
              </div>
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="SWPPP Plan Design"
                  value={name}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Full ADEQ Plan Set"
                value={description}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price">Price ($)</Label>
                <Input
                  id="price"
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={price}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">Unit</Label>
                <UnitCombobox onChange={setUnit} value={unit} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="defaultQty">Default Qty</Label>
                <Input
                  id="defaultQty"
                  onChange={(e) => setDefaultQty(e.target.value)}
                  placeholder="1"
                  step="0.01"
                  type="number"
                  value={defaultQty}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional pricing notes or instructions..."
                rows={2}
                value={notes}
              />
            </div>

            {/* Takeoff toggle - only shown for categories that support takeoff and units that are measurable */}
            {canBeTakeoffItem && (
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Crosshair className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <Label
                      className="font-medium text-sm"
                      htmlFor="takeoff-toggle"
                    >
                      Enable for Takeoff
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      This item can be measured from PDF plans
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isTakeoffItem}
                  id="takeoff-toggle"
                  onCheckedChange={setIsTakeoffItem}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              disabled={isLoading}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!(code.trim() && name.trim()) || isLoading}
              type="submit"
            >
              {getButtonText()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
