import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

type ListItem = {
  label: string;
  value: string;
};

interface ListProps {
  className?: string;
  items: ListItem[];
  onSelect: (item: ListItem) => void;
  value?: string;
}

export function List({ items, className, value, onSelect }: ListProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {items.map((item) => {
        const isSelected = value === item.value;

        return (
          <Button
            className={cn(
              "justify-start text-left",
              isSelected ? "font-bold" : "font-normal"
            )}
            key={item.value}
            onClick={() => onSelect?.(item)}
            size="sm"
            variant="ghost"
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
