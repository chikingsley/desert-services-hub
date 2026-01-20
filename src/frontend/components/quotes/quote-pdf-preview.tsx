"use client";

import { Mountain } from "lucide-react";
import { useMemo } from "react";
import type {
  Quote,
  QuoteLineItem,
  QuoteSection,
  QuoteVersion,
} from "@/lib/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

interface QuotePDFPreviewProps {
  quote: Quote;
  version: QuoteVersion;
  sections: QuoteSection[];
  lineItems: QuoteLineItem[];
  total: number;
}

export function QuotePDFPreview({
  quote,
  version,
  sections,
  lineItems,
  total,
}: QuotePDFPreviewProps) {
  // Group line items by section
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

  // Calculate section subtotals
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

  return (
    <div className="mx-auto max-w-[8.5in] rounded-lg border bg-white text-black shadow-lg">
      {/* PDF Content - styled to look like a printed document */}
      <div
        className="p-8"
        style={{ fontFamily: "Arial, sans-serif", fontSize: "11px" }}
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between border-b pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-700 text-white">
              <Mountain className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-bold text-amber-800 text-xl">
                Desert Services
              </h1>
              <p className="text-gray-600 text-xs">
                Site Work & Erosion Control
              </p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="font-bold text-lg">ESTIMATE</h2>
            <p className="text-sm">
              #{quote.base_number}
              {version.version_number > 1 && `-R${version.version_number - 1}`}
            </p>
            <p className="text-gray-600 text-xs">
              Date: {formatDate(quote.created_at)}
            </p>
          </div>
        </div>

        {/* Job & Client Info */}
        <div className="mb-6 grid grid-cols-2 gap-8">
          <div>
            <h3
              className="mb-2 font-bold text-gray-600 uppercase"
              style={{ fontSize: "10px" }}
            >
              Bill To
            </h3>
            {quote.client_name && (
              <p className="font-semibold">{quote.client_name}</p>
            )}
            {quote.client_email && (
              <p className="text-gray-600">{quote.client_email}</p>
            )}
            {quote.client_phone && (
              <p className="text-gray-600">{quote.client_phone}</p>
            )}
            {!quote.client_name && (
              <p className="text-gray-400 italic">No client specified</p>
            )}
          </div>
          <div>
            <h3
              className="mb-2 font-bold text-gray-600 uppercase"
              style={{ fontSize: "10px" }}
            >
              Job Information
            </h3>
            <p className="font-semibold">{quote.job_name}</p>
            {quote.job_address && (
              <p className="text-gray-600">{quote.job_address}</p>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <table className="mb-6 w-full" style={{ fontSize: "10px" }}>
          <thead>
            <tr className="border-gray-800 border-b-2">
              <th className="p-2 text-left">Description</th>
              <th className="w-16 p-2 text-right">Qty</th>
              <th className="w-12 p-2 text-center">Unit</th>
              <th className="w-20 p-2 text-right">Unit Price</th>
              <th className="w-24 p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Unsectioned items first */}
            {itemsBySection.unsectioned.map((item) => (
              <LineItemRow item={item} key={item.id} />
            ))}

            {/* Sectioned items */}
            {sections.map((section) => (
              <>
                {/* Section Header */}
                <tr className="bg-gray-100" key={`section-${section.id}`}>
                  <td className="p-2 font-bold" colSpan={5}>
                    {section.name}
                  </td>
                </tr>
                {/* Section Items */}
                {itemsBySection[section.id]?.map((item) => (
                  <LineItemRow item={item} key={item.id} />
                ))}
                {/* Section Subtotal */}
                {itemsBySection[section.id]?.length > 0 && (
                  <tr className="border-t" key={`subtotal-${section.id}`}>
                    <td
                      className="p-2 text-right font-medium text-gray-600 text-xs"
                      colSpan={4}
                    >
                      {section.name} Subtotal:
                    </td>
                    <td className="p-2 text-right font-medium">
                      {formatCurrency(sectionSubtotals[section.id])}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div className="mb-8 flex justify-end">
          <div className="w-64 border-gray-800 border-t-2 pt-2">
            <div className="flex justify-between font-bold text-lg">
              <span>TOTAL:</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t pt-6" style={{ fontSize: "9px" }}>
          <div className="mb-4">
            <h4 className="mb-2 font-bold">Terms & Conditions</h4>
            <p className="text-gray-600">
              This estimate is valid for 30 days. Prices are subject to change
              based on site conditions. Additional work not included in this
              estimate will be billed separately. Payment terms: Net 30 days.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="mb-4 font-bold">Accepted By:</p>
              <div className="mb-2 border-gray-400 border-b pb-4" />
              <p className="text-gray-600">Signature / Date</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-amber-800">Desert Services LLC</p>
              <p className="text-gray-600">Phoenix, AZ</p>
              <p className="text-gray-600">info@desertservices.com</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineItemRow({ item }: { item: QuoteLineItem }) {
  const total = item.quantity * item.unit_price;

  return (
    <tr
      className={cn(
        "border-gray-200 border-b",
        item.is_excluded && "text-gray-400"
      )}
    >
      <td className={cn("p-2", item.is_excluded && "line-through")}>
        {item.description}
      </td>
      <td className="p-2 text-right">{item.quantity}</td>
      <td className="p-2 text-center">{item.unit}</td>
      <td className="p-2 text-right">{formatCurrency(item.unit_price)}</td>
      <td
        className={cn(
          "p-2 text-right font-medium",
          item.is_excluded && "line-through"
        )}
      >
        {item.is_excluded ? "-" : formatCurrency(total)}
      </td>
    </tr>
  );
}
