import type { Table } from "@tanstack/react-table";
import { Columns3, LayoutGrid, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Human-readable column names
const columnLabels: Record<string, string> = {
  applicationNumber: "Application #",
  project: "Project",
  location: "Location",
  submitted: "Submitted",
  issued: "Issued",
  expires: "Expires",
  status: "Status",
};

// View presets
const viewPresets = {
  compact: {
    label: "Compact",
    icon: Columns3,
    columns: {
      applicationNumber: true,
      project: true,
      location: true,
      submitted: false,
      issued: false,
      expires: true,
      status: true,
    },
  },
  full: {
    label: "Full",
    icon: LayoutGrid,
    columns: {
      applicationNumber: true,
      project: true,
      location: true,
      submitted: true,
      issued: true,
      expires: true,
      status: true,
    },
  },
} as const;

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const applyPreset = (preset: keyof typeof viewPresets) => {
    const { columns } = viewPresets[preset];
    for (const [columnId, isVisible] of Object.entries(columns)) {
      const column = table.getColumn(columnId);
      if (column) {
        column.toggleVisibility(isVisible);
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="ml-auto h-8 gap-2" size="sm" variant="outline">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">View</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        <DropdownMenuLabel>Presets</DropdownMenuLabel>
        {Object.entries(viewPresets).map(([key, preset]) => {
          const Icon = preset.icon;
          return (
            <DropdownMenuItem
              key={key}
              onClick={() => applyPreset(key as keyof typeof viewPresets)}
            >
              <Icon className="mr-2 h-4 w-4" />
              {preset.label}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                checked={column.getIsVisible()}
                key={column.id}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {columnLabels[column.id] || column.id}
              </DropdownMenuCheckboxItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
