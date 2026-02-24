import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { UserLabel } from "@/hooks/useLabels";
import { cn } from "@/utils";

interface MentionListProps {
  command: (item: UserLabel & { isCreateNew?: boolean }) => void;
  items: (UserLabel & { isCreateNew?: boolean })[];
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + items.length - 1) % items.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), []);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="relative rounded-md border border-slate-200 bg-white px-2 py-2 text-sm shadow-md">
          <div className="text-slate-500">
            No labels found. Type to create a new label.
          </div>
        </div>
      );
    }

    return (
      <div className="relative max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-md">
        {items.map((item, index) => (
          <button
            className={cn(
              "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-slate-100",
              index === selectedIndex && "bg-slate-100"
            )}
            key={item.id}
            onClick={() => selectItem(index)}
            type="button"
          >
            {item.isCreateNew ? (
              <>
                <span className="flex-1 truncate">
                  <strong>Create label:</strong>{" "}
                  <span className="font-medium">{item.name}</span>
                </span>
                <span className="ml-2 text-slate-500 text-xs">+</span>
              </>
            ) : (
              <span className="flex-1 truncate">{item.name}</span>
            )}
          </button>
        ))}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";
