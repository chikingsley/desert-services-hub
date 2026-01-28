"use client";

import { Edit2, Eye, EyeOff, Info, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CatalogItemData } from "./catalog-content";

interface CatalogItemRowProps {
  item: CatalogItemData;
  onUpdate: (updates: Partial<CatalogItemData>) => void;
  onEdit: () => void;
  onDelete: () => void;
  indented?: boolean;
  readOnly?: boolean;
}

export function CatalogItemRow({
  item,
  onUpdate,
  onEdit,
  onDelete,
  indented,
  readOnly = false,
}: CatalogItemRowProps) {
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [editPrice, setEditPrice] = useState(item.price.toString());

  const handlePriceSubmit = () => {
    const newPrice = Number.parseFloat(editPrice);
    if (!Number.isNaN(newPrice) && newPrice !== item.price) {
      onUpdate({ price: newPrice });
    }
    setIsEditingPrice(false);
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePriceSubmit();
    } else if (e.key === "Escape") {
      setEditPrice(item.price.toString());
      setIsEditingPrice(false);
    }
  };

  const toggleActive = () => {
    onUpdate({ isActive: !item.isActive });
  };

  const handleDelete = () => {
    onDelete();
  };

  // Format price: show decimals only if needed
  const formatPrice = (price: number) => {
    if (price % 1 === 0) {
      return price.toLocaleString("en-US");
    }
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/20",
        indented && "pl-12",
        !item.isActive && "opacity-50"
      )}
    >
      {/* Code */}
      <span className="w-24 shrink-0 font-mono text-muted-foreground text-xs">
        {item.code}
      </span>

      {/* Name & Description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-sm">{item.name}</p>
          {item.notes && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="top">
                  <p className="text-xs">{item.notes}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {item.description && (
          <p className="truncate text-muted-foreground text-xs">
            {item.description}
          </p>
        )}
      </div>

      {/* Unit */}
      <span className="w-24 shrink-0 text-right text-muted-foreground text-xs">
        {item.unit}
      </span>

      {/* Price - Inline Editable */}
      <div className="w-28 shrink-0">
        {(() => {
          if (isEditingPrice && !readOnly) {
            return (
              <Input
                autoFocus
                className="h-7 text-right font-medium text-sm"
                onBlur={handlePriceSubmit}
                onChange={(e) => setEditPrice(e.target.value)}
                onKeyDown={handlePriceKeyDown}
                step="0.01"
                type="number"
                value={editPrice}
              />
            );
          }
          if (readOnly) {
            return (
              <span className="block w-full text-right font-display font-semibold text-foreground text-sm">
                ${formatPrice(item.price)}
              </span>
            );
          }
          return (
            <button
              className="w-full text-right font-display font-semibold text-primary text-sm transition-colors hover:text-primary/80"
              onClick={() => setIsEditingPrice(true)}
              type="button"
            >
              ${formatPrice(item.price)}
            </button>
          );
        })()}
      </div>

      {/* Action Buttons - Always visible on hover */}
      {!readOnly && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            className="h-7 w-7"
            onClick={onEdit}
            size="icon"
            title="Edit item"
            variant="ghost"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            className="h-7 w-7"
            onClick={toggleActive}
            size="icon"
            title={item.isActive ? "Deactivate" : "Activate"}
            variant="ghost"
          >
            {item.isActive ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleDelete}
            size="icon"
            title="Delete item"
            variant="ghost"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
