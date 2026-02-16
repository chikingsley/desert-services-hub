import type { Catalog } from "@estimates/catalog/types";
import type { EditorLineItem } from "@lib/db/types";
import { ItemCombobox } from "@/apps/web/frontend/components/estimates/item-combobox";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Input } from "@/apps/web/frontend/components/ui/input";
import type { CatalogItemInfo } from "@/apps/web/frontend/lib/catalog-item-info";
import { formatCurrency } from "@/lib/utils";

interface EstimateLineItemRowProps {
  item: EditorLineItem;
  catalogCategoryId?: string;
  catalog: Catalog;
  compactRows: boolean;
  onRemove: (id: string) => void;
  onUpdate: (
    id: string,
    field: keyof EditorLineItem,
    value: string | number | boolean
  ) => void;
  onUpdateFromCatalog: (id: string, catalogItem: CatalogItemInfo) => void;
}

export function EstimateLineItemRow({
  item,
  catalogCategoryId,
  catalog,
  compactRows,
  onRemove,
  onUpdate,
  onUpdateFromCatalog,
}: EstimateLineItemRowProps) {
  return (
    <>
      {/* Desktop view */}
      <div className={compactRows ? "hidden" : "hidden items-center md:flex"}>
        <Button
          className="h-9 w-9 shrink-0 rounded-lg p-0 transition-transform hover:scale-105"
          onClick={() => onRemove(item.id)}
          size="sm"
          variant="destructive"
        >
          X
        </Button>
        <Button
          className="ml-2 h-9 rounded-lg px-2 font-semibold text-xs"
          onClick={() => onUpdate(item.id, "isAlternate", !item.isAlternate)}
          size="sm"
          variant={item.isAlternate ? "destructive" : "outline"}
        >
          ALT
        </Button>
        <div className="ml-2 min-w-0 flex-[2]">
          <ItemCombobox
            catalog={catalog}
            categoryId={catalogCategoryId}
            currentValue={item.item}
            onSelect={(catalogItem) =>
              onUpdateFromCatalog(item.id, catalogItem)
            }
          />
        </div>
        <Input
          className="ml-2 h-9 min-w-0 flex-[3] rounded-lg border-border/50 bg-background text-sm transition-colors focus:border-primary"
          onChange={(e) => onUpdate(item.id, "description", e.target.value)}
          value={item.description}
        />
        <Input
          className="ml-2 h-9 w-20 rounded-lg border-border/50 bg-background text-sm transition-colors focus:border-primary"
          onChange={(e) =>
            onUpdate(item.id, "qty", Number.parseFloat(e.target.value) || 0)
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
            onUpdate(item.id, "cost", Number.parseFloat(e.target.value) || 0)
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
      <div
        className={
          compactRows
            ? "space-y-2 rounded-xl border border-border/50 bg-card p-4 shadow-sm"
            : "space-y-2 rounded-xl border border-border/50 bg-card p-4 shadow-sm md:hidden"
        }
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Item
          </span>
          <div className="flex gap-2">
            <Button
              className="h-8 w-8 rounded-lg p-0"
              onClick={() => onRemove(item.id)}
              size="sm"
              variant="destructive"
            >
              X
            </Button>
            <Button
              className="h-8 rounded-lg px-2 font-semibold text-xs"
              onClick={() =>
                onUpdate(item.id, "isAlternate", !item.isAlternate)
              }
              size="sm"
              variant={item.isAlternate ? "destructive" : "outline"}
            >
              ALT
            </Button>
          </div>
        </div>
        <Input
          className="h-10 rounded-lg border-border/50 bg-background text-sm"
          onChange={(e) => onUpdate(item.id, "description", e.target.value)}
          placeholder="Description"
          value={item.description}
        />
        <div className="grid grid-cols-[minmax(0,1fr)_3.9rem_3.4rem_4.9rem_5.1rem] gap-2">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
              Item
            </p>
            <ItemCombobox
              catalog={catalog}
              categoryId={catalogCategoryId}
              className="h-10"
              currentValue={item.item}
              onSelect={(catalogItem) =>
                onUpdateFromCatalog(item.id, catalogItem)
              }
            />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
              Amt
            </p>
            <Input
              className="h-10 rounded-lg border-border/50 bg-background px-2 text-xs"
              inputMode="decimal"
              onChange={(e) =>
                onUpdate(item.id, "qty", Number.parseFloat(e.target.value) || 0)
              }
              placeholder="Amt"
              type="number"
              value={item.qty}
            />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
              U/M
            </p>
            <div className="flex h-10 items-center justify-center rounded-lg border border-border/50 bg-muted/50 px-1 text-[11px] text-muted-foreground">
              {item.uom}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
              Cost
            </p>
            <Input
              className="h-10 rounded-lg border-border/50 bg-background px-2 text-xs"
              inputMode="decimal"
              onChange={(e) =>
                onUpdate(
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
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wide">
              Tot
            </p>
            <div className="flex h-10 items-center justify-end whitespace-nowrap rounded-lg border border-border/50 bg-muted/30 px-2 text-right font-mono font-semibold text-xs">
              {formatCurrency(item.total)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
