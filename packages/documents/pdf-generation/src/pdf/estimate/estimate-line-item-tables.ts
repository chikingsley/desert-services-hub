import type { EditorLineItem, EditorSection } from "@lib/db/types";
import type { Content, TableCell } from "pdfmake/interfaces";
import { borderedLayout } from "../shared/layouts";

interface GroupedItems {
  items: EditorLineItem[];
  section: EditorSection | null;
}

export interface EstimateLineItemTableOptions {
  style: "simple" | "sectioned";
  unbreakableSections: boolean;
}

const TABLE_WIDTHS = [18, 90, "*", "auto", 32, "auto", "auto"];
const PARENS_REGEX = /\s\(([^)]+)\)$/;

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function groupItemsBySection(
  items: EditorLineItem[],
  sections: EditorSection[]
): GroupedItems[] {
  const groups: GroupedItems[] = [];

  const unsectioned: EditorLineItem[] = [];
  for (const item of items) {
    if (item.sectionId === undefined) {
      unsectioned.push(item);
    }
  }

  if (unsectioned.length > 0) {
    groups.push({ section: null, items: unsectioned });
  }

  for (const section of sections) {
    const sectionItems: EditorLineItem[] = [];
    for (const item of items) {
      if (item.sectionId === section.id) {
        sectionItems.push(item);
      }
    }

    if (sectionItems.length > 0) {
      groups.push({ section, items: sectionItems });
    }
  }

  return groups;
}

function calculateGroupSubtotal(items: EditorLineItem[]): number {
  let total = 0;
  for (const item of items) {
    total += item.total;
  }
  return total;
}

function buildTableHeader(): TableCell[] {
  return [
    { text: "#", style: "tableHeader", alignment: "center", noWrap: true },
    { text: "Item", style: "tableHeader", noWrap: true },
    { text: "Description", style: "tableHeader", noWrap: true },
    { text: "Qty", style: "tableHeader", alignment: "center", noWrap: true },
    { text: "U/M", style: "tableHeader", alignment: "center", noWrap: true },
    { text: "Cost", style: "tableHeader", alignment: "right", noWrap: true },
    { text: "Total", style: "tableHeader", alignment: "right", noWrap: true },
  ];
}

function buildSectionRow(sectionName: string): TableCell[] {
  return [
    {
      text: sectionName,
      colSpan: 7,
      style: "sectionHeader",
    },
    {},
    {},
    {},
    {},
    {},
    {},
  ];
}

function buildItemRow(rowNumber: number, item: EditorLineItem): TableCell[] {
  const itemText = item.item.replace(PARENS_REGEX, "\n($1)");

  const descriptionText = item.isAlternate
    ? [
        {
          text: "[ALTERNATE] ",
          color: "#b91c1c",
          bold: true,
        },
        {
          text:
            item.description.trim().length > 0
              ? item.description
              : "Not included unless selected.",
        },
      ]
    : item.description;

  return [
    { text: String(rowNumber), style: "tableCell", alignment: "center" },
    { text: itemText, style: "tableCell" },
    { text: descriptionText, style: "tableCell" },
    {
      text: String(item.qty),
      style: "tableCell",
      alignment: "center",
      noWrap: true,
    },
    { text: item.uom, style: "tableCell", alignment: "center" },
    {
      text: formatCurrency(item.cost),
      style: "tableCell",
      alignment: "right",
      noWrap: true,
    },
    {
      text: formatCurrency(item.total),
      style: "tableCell",
      alignment: "right",
      noWrap: true,
    },
  ];
}

function buildSubtotalRow(subtotal: number): TableCell[] {
  return [
    { text: "", colSpan: 5 },
    {},
    {},
    {},
    {},
    { text: "Subtotal:", style: "subtotalCell", alignment: "right" },
    {
      text: formatCurrency(subtotal),
      style: "subtotalCell",
      alignment: "right",
    },
  ];
}

function buildSectionTables(
  groupedItems: GroupedItems[],
  _unbreakable: boolean
): Content[] {
  const tables: Content[] = [];
  let rowNumber = 0;
  let isFirst = true;

  for (const group of groupedItems) {
    const sectionBody: TableCell[][] = [];
    const isFirstTable = isFirst;

    if (isFirst) {
      sectionBody.push(buildTableHeader());
    }

    if (group.section !== null) {
      const displayName = group.section.title ?? group.section.name;
      sectionBody.push(buildSectionRow(displayName));
    }

    for (const item of group.items) {
      rowNumber += 1;
      sectionBody.push(buildItemRow(rowNumber, item));
    }

    if (group.section?.showSubtotal) {
      const subtotal = calculateGroupSubtotal(group.items);
      sectionBody.push(buildSubtotalRow(subtotal));
    }

    const sectionTable: Content = {
      margin: isFirst
        ? undefined
        : ([0, 4, 0, 0] as [number, number, number, number]),
      table: {
        headerRows: isFirst ? 1 : 0,
        dontBreakRows: true,
        widths: TABLE_WIDTHS,
        body: sectionBody,
      },
      layout: {
        ...borderedLayout,
        fillColor: (rowIndex: number) =>
          isFirstTable && rowIndex === 0 ? "#f0f0f0" : null,
      },
    };

    tables.push(sectionTable);
    isFirst = false;
  }

  return tables;
}

function buildSimpleLineItems(lineItems: EditorLineItem[]): Content[] {
  const tableBody: TableCell[][] = [];

  tableBody.push(buildTableHeader());

  let rowNumber = 0;
  for (const item of lineItems) {
    rowNumber += 1;
    tableBody.push(buildItemRow(rowNumber, item));
  }

  const table: Content = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: TABLE_WIDTHS,
      body: tableBody,
    },
    layout: {
      ...borderedLayout,
      fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f0f0f0" : null),
    },
  };

  return [table];
}

export function buildEstimateLineItemTables(
  lineItems: EditorLineItem[],
  sections: EditorSection[],
  options: EstimateLineItemTableOptions
): Content[] {
  if (options.style === "simple") {
    return buildSimpleLineItems(lineItems);
  }

  return buildSectionTables(
    groupItemsBySection(lineItems, sections),
    options.unbreakableSections
  );
}
