"use client";

import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/apps/web/frontend/components/ui/table";
import { cn } from "@/lib/utils";

interface VirtualizedTableProps<T> {
  rows: T[];
  rowHeight?: number;
  overscan?: number;
  colSpan: number;
  maxBodyHeightClassName?: string;
  header: ReactNode;
  renderRow: (row: T, index: number) => ReactNode;
  empty: ReactNode;
  tableClassName?: string;
  scrollMode?: "container" | "page";
}

export function VirtualizedTable<T>({
  rows,
  rowHeight = 40,
  overscan = 8,
  colSpan,
  maxBodyHeightClassName = "max-h-[62vh]",
  header,
  renderRow,
  empty,
  tableClassName,
  scrollMode = "container",
}: VirtualizedTableProps<T>) {
  const shouldVirtualize = scrollMode === "container";

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    if (!shouldVirtualize) {
      return;
    }

    const el = bodyRef.current;
    if (!el) {
      return;
    }

    const update = () => {
      setViewportHeight(el.clientHeight);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [shouldVirtualize]);

  const { startIndex, endIndex, topSpacer, bottomSpacer } = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: rows.length,
        topSpacer: 0,
        bottomSpacer: 0,
      };
    }

    if (rows.length === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacer: 0,
        bottomSpacer: 0,
      };
    }

    const effectiveViewportHeight =
      viewportHeight > 0 ? viewportHeight : rowHeight * 12;
    const visibleCount = Math.ceil(effectiveViewportHeight / rowHeight);
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(rows.length, start + visibleCount + overscan * 2);

    const top = start * rowHeight;
    const bottom = Math.max(0, (rows.length - end) * rowHeight);

    return {
      startIndex: start,
      endIndex: end,
      topSpacer: top,
      bottomSpacer: bottom,
    };
  }, [
    rows.length,
    viewportHeight,
    rowHeight,
    scrollTop,
    overscan,
    shouldVirtualize,
  ]);

  const visibleRows = rows.slice(startIndex, endIndex);

  if (!shouldVirtualize) {
    return (
      <Table className={tableClassName}>
        {header}
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                className="py-10 text-center text-muted-foreground"
                colSpan={colSpan}
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((row, index) => renderRow(row, index))
          )}
        </TableBody>
      </Table>
    );
  }

  return (
    <>
      <Table className={tableClassName}>{header}</Table>
      <div
        className={cn("min-h-[320px] overflow-auto", maxBodyHeightClassName)}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        ref={bodyRef}
      >
        <Table className={tableClassName}>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={colSpan}
                >
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {topSpacer > 0 ? (
                  <TableRow aria-hidden="true" className="hover:bg-transparent">
                    <TableCell
                      colSpan={colSpan}
                      style={{ height: topSpacer, padding: 0 }}
                    />
                  </TableRow>
                ) : null}

                {visibleRows.map((row, index) =>
                  renderRow(row, startIndex + index)
                )}

                {bottomSpacer > 0 ? (
                  <TableRow aria-hidden="true" className="hover:bg-transparent">
                    <TableCell
                      colSpan={colSpan}
                      style={{ height: bottomSpacer, padding: 0 }}
                    />
                  </TableRow>
                ) : null}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
