import { CalendarIcon, List, Plus, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Calendar,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import catalog from "./catalog.json";
import {
  AddressAutocomplete,
  AmendmentBanner,
  CatalogCombobox,
  ContractorAutocomplete,
  EmployeeSelect,
  QuotesTable,
  type QuoteTableRow,
  SectionCombobox,
  ThemeToggle,
} from "./components";
import { generateEstimatePDFBlob } from "./estimate-pdf-make";
import { useQuoteVersioning } from "./hooks";
import {
  type Catalog,
  type CatalogItem,
  type CatalogSubcategory,
  findItemInCategory,
  type LineItem,
  type Quote,
  type QuoteSection,
} from "./types";
import "./index.css";

const serviceCatalog = catalog as Catalog;

// Generate estimate number in YYMMDD## format
function generateEstimateNumber(sequenceNum = 1): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const seq = String(sequenceNum).padStart(2, "0");
  return `${yy}${mm}${dd}${seq}`;
}

const mockQuote: Quote = {
  estimateNumber: generateEstimateNumber(1),
  date: new Date().toISOString(),
  estimator: "Jared Aiken",
  estimatorEmail: "Jared@desertservices.net",
  billTo: {
    companyName: "Caliente Construction",
    address: "485 W Vaughn St. Tempe, AZ 85283",
    email: "contact@caliente.com",
    phone: "480-555-1234",
  },
  jobInfo: {
    siteName: "KIWANIS PARK NORTH IMPROV",
    address: "123 Park Ave, Tempe, AZ",
  },
  sections: [],
  lineItems: [],
  total: 0,
};

// Sample data for the quotes table
const sampleQuotes: QuoteTableRow[] = [
  {
    id: "1",
    estimate_number: "25121701",
    revision_number: 1,
    date: new Date().toISOString(),
    status: "draft",
    company_name: "Caliente Construction",
    job_name: "KIWANIS PARK NORTH IMPROV",
    total: 4500.0,
  },
  {
    id: "2",
    estimate_number: "25121502",
    revision_number: 1,
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: "sent",
    company_name: "Sunbelt Rentals",
    job_name: "DOWNTOWN OFFICE COMPLEX",
    total: 12_350.0,
  },
  {
    id: "3",
    estimate_number: "25121001",
    revision_number: 2,
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: "accepted",
    company_name: "ABC Builders",
    job_name: "MESA RESIDENTIAL PROJECT",
    total: 8200.0,
  },
  {
    id: "4",
    estimate_number: "25120501",
    revision_number: 1,
    date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    status: "declined",
    company_name: "Caliente Construction",
    job_name: "SCOTTSDALE MALL RENOVATION",
    total: 22_100.0,
  },
];

export function App() {
  const {
    quote,
    status,
    currentVersion,
    isLocked,
    isAmending,
    pendingChanges,
    updateQuote,
    lockQuote,
    startAmendment,
    finalizeAmendment,
    discardAmendment,
  } = useQuoteVersioning({ initialQuote: mockQuote });

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // Active tab state
  const [activeTab, setActiveTab] = useState("editor");

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-save quote to database (debounced)
  useEffect(() => {
    // Don't auto-save empty quotes
    if (quote.lineItems.length === 0 && !quote.billTo.companyName) {
      return;
    }

    setSaveStatus("unsaved");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const { createQuote, updateQuote: updateQuoteApi } = await import(
          "./api"
        );

        const quoteData = {
          estimate_number: quote.estimateNumber,
          date: quote.date,
          status: "draft" as const,
          estimator_name: quote.estimator,
          estimator_email: quote.estimatorEmail,
          company_name: quote.billTo.companyName,
          company_address: quote.billTo.address,
          job_name: quote.jobInfo.siteName,
          job_address: quote.jobInfo.address,
          total: quote.total,
          line_items: quote.lineItems,
          sections: quote.sections,
        };

        if (quoteId) {
          await updateQuoteApi(quoteId, quoteData);
        } else {
          const created = await createQuote(quoteData);
          setQuoteId(created.id);
        }
        setSaveStatus("saved");
      } catch (err) {
        console.error("Failed to save quote:", err);
        setSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [quote, quoteId]);

  // Quotes list state (from API)
  const [quotesData, setQuotesData] = useState<QuoteTableRow[]>(sampleQuotes);
  const [quotesCompanies, setQuotesCompanies] = useState<string[]>([
    "Caliente Construction",
    "Sunbelt Rentals",
    "ABC Builders",
  ]);
  const [quotesLoading, setQuotesLoading] = useState(false);

  // Reset quote when switching to New tab
  const handleTabChange = (value: string | null) => {
    if (!value) {
      return;
    }
    setActiveTab(value);
    // Reset to new quote when clicking New tab
    if (value === "editor") {
      setQuoteId(null); // Reset so new quote gets created
      setSaveStatus("saved");
      updateQuote(() => ({
        ...mockQuote,
        estimateNumber: generateEstimateNumber(1),
        date: new Date().toISOString(),
      }));
    }
  };

  // Fetch quotes from API on mount
  useEffect(() => {
    const loadQuotes = async () => {
      setQuotesLoading(true);
      try {
        const { fetchQuotes } = await import("./api");
        const { quotes } = await fetchQuotes({ limit: 100 });
        // Transform to table format
        const tableData: QuoteTableRow[] = quotes.map((q) => ({
          id: q.id,
          estimate_number: q.estimate_number,
          revision_number: q.revision_number,
          date: q.date,
          status: q.status,
          company_name: q.company_name,
          job_name: q.job_name,
          total: q.total,
        }));
        setQuotesData(tableData);
        // Get unique companies
        const companies = [
          ...new Set(quotes.map((q) => q.company_name).filter(Boolean)),
        ] as string[];
        setQuotesCompanies(companies);
      } catch (err) {
        console.error("Failed to load quotes:", err);
        // Keep sample data on error
      } finally {
        setQuotesLoading(false);
      }
    };
    loadQuotes();
  }, []);

  const handlePreviewPdf = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDownloadPdf = () => {
    if (!pdfBlobUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = pdfBlobUrl;
    link.download = `quote-${quote.estimateNumber || "draft"}.pdf`;
    link.click();
  };

  // Generate pdfmake blob when quote changes
  useEffect(() => {
    let currentUrl: string | null = null;

    generateEstimatePDFBlob(quote)
      .then((blob) => {
        currentUrl = URL.createObjectURL(blob);
        setPdfBlobUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return currentUrl;
        });
      })
      .catch((err) => {
        console.error("PDF generation error:", err);
      });

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [quote]);

  const updateLineItem = useCallback(
    (id: string, field: keyof LineItem, value: string | number | boolean) => {
      updateQuote((prev) => {
        const updated = prev.lineItems.map((item) => {
          if (item.id === id) {
            const newItem = { ...item, [field]: value };
            if (field === "qty" || field === "cost") {
              newItem.total = Number(newItem.qty) * Number(newItem.cost);
            }
            return newItem;
          }
          return item;
        });
        // Only count non-struck items in the total
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);
        return { ...prev, lineItems: updated, total };
      });
    },
    [updateQuote]
  );

  const addLineItem = useCallback(() => {
    const newItem: LineItem = {
      id: String(Date.now()),
      item: "",
      description: "",
      qty: 1,
      uom: "EA",
      cost: 0,
      total: 0,
    };
    updateQuote((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem],
    }));
  }, [updateQuote]);

  const removeLineItem = useCallback(
    (id: string) => {
      updateQuote((prev) => {
        const itemToRemove = prev.lineItems.find((item) => item.id === id);
        const updated = prev.lineItems.filter((item) => item.id !== id);
        const total = updated.reduce((sum, item) => sum + item.total, 0);

        // Remove section if no items left in it
        let updatedSections = prev.sections;
        if (itemToRemove?.sectionId) {
          const itemsInSection = updated.filter(
            (item) => item.sectionId === itemToRemove.sectionId
          );
          if (itemsInSection.length === 0) {
            updatedSections = prev.sections.filter(
              (s) => s.id !== itemToRemove.sectionId
            );
          }
        }

        return {
          ...prev,
          sections: updatedSections,
          lineItems: updated,
          total,
        };
      });
    },
    [updateQuote]
  );
  const addFromCatalog = (value: string) => {
    // Value format: "categoryId::itemCode" or "categoryId::subcategoryId::itemCode"
    const parts = value.split("::");
    if (parts.length < 2) {
      return;
    }

    const categoryId = parts[0];
    if (!categoryId) {
      return;
    }

    const category = serviceCatalog.categories.find((c) => c.id === categoryId);
    if (!category) {
      return;
    }

    // Handle special DUST-PERMIT entry (acreage-based pricing)
    if (parts[1] === "DUST-PERMIT") {
      const newItem: LineItem = {
        id: String(Date.now()),
        item: "Dust Permit (by acreage)",
        description: "Enter acreage to calculate permit fee",
        qty: 1,
        uom: "Each",
        cost: 0,
        total: 0,
        sectionId: categoryId,
      };

      updateQuote((prev) => {
        const sectionExists = prev.sections.some((s) => s.id === categoryId);
        const newSections = sectionExists
          ? prev.sections
          : [...prev.sections, { id: categoryId, name: category.name }];

        const updated = [...prev.lineItems, newItem];
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);

        return {
          ...prev,
          sections: newSections,
          lineItems: updated,
          total,
        };
      });
      return;
    }

    let catalogItem: CatalogItem | undefined;
    let subcategory: CatalogSubcategory | undefined;

    if (parts.length === 2) {
      // Direct item: categoryId::itemCode
      const itemCode = parts[1];
      if (!itemCode) {
        return;
      }
      const result = findItemInCategory(category, itemCode);
      if (result) {
        catalogItem = result.item;
        subcategory = result.subcategory;
      }
    } else {
      // Subcategory item: categoryId::subcategoryId::itemCode
      const subId = parts[1];
      const itemCode = parts[2];
      subcategory = category.subcategories?.find((s) => s.id === subId);
      if (subcategory) {
        catalogItem = subcategory.items.find((i) => i.code === itemCode);
      }
    }

    if (!catalogItem) {
      return;
    }

    // Check if this is a pick-one subcategory and remove existing items from same subcategory
    const isPickOne = subcategory?.selectionMode === "pick-one";

    updateQuote((prev) => {
      let updatedLineItems = prev.lineItems;

      // If pick-one, remove existing items from same subcategory
      if (isPickOne && subcategory) {
        updatedLineItems = prev.lineItems.filter(
          (item) =>
            !(
              item.sectionId === categoryId &&
              item.subcategoryId === subcategory.id
            )
        );
      }

      // Check if item already exists (match by item name and section)
      const existingItemIndex = updatedLineItems.findIndex(
        (item) =>
          item.item === catalogItem.name && item.sectionId === categoryId
      );

      if (existingItemIndex !== -1) {
        // Increment quantity of existing item
        updatedLineItems = updatedLineItems.map((item, index) => {
          if (index === existingItemIndex) {
            const newQty = item.qty + (catalogItem.defaultQty ?? 1);
            return {
              ...item,
              qty: newQty,
              total: newQty * item.cost,
            };
          }
          return item;
        });
      } else {
        // Add new item
        const qty = catalogItem.defaultQty ?? 1;
        const newItem: LineItem = {
          id: String(Date.now()),
          item: catalogItem.name,
          description: catalogItem.description,
          qty,
          uom: catalogItem.unit,
          cost: catalogItem.price,
          total: catalogItem.price * qty,
          sectionId: categoryId,
          subcategoryId: subcategory?.id,
        };
        updatedLineItems = [...updatedLineItems, newItem];
      }

      // Add section if it doesn't exist
      const sectionExists = prev.sections.some((s) => s.id === categoryId);
      const newSections = sectionExists
        ? prev.sections
        : [...prev.sections, { id: categoryId, name: category.name }];

      const total = updatedLineItems
        .filter((item) => !item.isStruck)
        .reduce((sum, item) => sum + item.total, 0);

      return {
        ...prev,
        sections: newSections,
        lineItems: updatedLineItems,
        total,
      };
    });
  };

  const addCategoryItems = (categoryId: string) => {
    const category = serviceCatalog.categories.find((c) => c.id === categoryId);
    if (!category) {
      return;
    }

    // Get all items, but for pick-one subcategories, only add the first item
    const newItems: LineItem[] = [];
    const timestamp = Date.now();

    // Direct items
    if (category.items) {
      for (const item of category.items) {
        const qty = item.defaultQty ?? 1;
        newItems.push({
          id: `${timestamp}-${item.code}`,
          item: item.name,
          description: item.description,
          qty,
          uom: item.unit,
          cost: item.price,
          total: item.price * qty,
          sectionId: categoryId,
        });
      }
    }

    // Subcategory items
    if (category.subcategories) {
      for (const sub of category.subcategories) {
        // Skip hidden subcategories
        if ((sub as { hidden?: boolean }).hidden) {
          continue;
        }
        const isPickOne = sub.selectionMode === "pick-one";
        const itemsToAdd = isPickOne ? [sub.items[0]] : sub.items;

        for (const item of itemsToAdd) {
          if (!item) {
            continue;
          }
          const qty = item.defaultQty ?? 1;
          newItems.push({
            id: `${timestamp}-${item.code}`,
            item: item.name,
            description: item.description,
            qty,
            uom: item.unit,
            cost: item.price,
            total: item.price * qty,
            sectionId: categoryId,
            subcategoryId: sub.id,
          });
        }
      }
    }

    if (newItems.length === 0) {
      return;
    }

    updateQuote((prev) => {
      // Check if section already exists - if so, skip (don't add duplicates)
      const sectionExists = prev.sections.some((s) => s.id === categoryId);
      if (sectionExists) {
        // Section already added - do nothing
        return prev;
      }

      const newSections: QuoteSection[] = [
        ...prev.sections,
        { id: categoryId, name: category.name },
      ];

      const updated = [...prev.lineItems, ...newItems];
      const total = updated
        .filter((item) => !item.isStruck)
        .reduce((sum, item) => sum + item.total, 0);
      return { ...prev, sections: newSections, lineItems: updated, total };
    });
  };

  const removeSection = useCallback(
    (sectionId: string) => {
      updateQuote((prev) => {
        const updatedItems = prev.lineItems.filter(
          (item) => item.sectionId !== sectionId
        );
        const updatedSections = prev.sections.filter((s) => s.id !== sectionId);
        const total = updatedItems.reduce((sum, item) => sum + item.total, 0);
        return {
          ...prev,
          sections: updatedSections,
          lineItems: updatedItems,
          total,
        };
      });
    },
    [updateQuote]
  );

  return (
    <div
      className="flex min-h-screen flex-col lg:h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Top Navigation */}
      <Tabs
        className="flex flex-1 flex-col"
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <div className="border-border border-b bg-card px-4">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-lg">Desert Services</span>
              <TabsList>
                <TabsTrigger value="list">
                  <List className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Quotes</span>
                </TabsTrigger>
                <TabsTrigger value="editor">
                  <Plus className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">New</span>
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                </TabsTrigger>
              </TabsList>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* List View */}
        <TabsContent className="flex-1 overflow-auto p-4" value="list">
          {quotesLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent" />
            </div>
          ) : (
            <QuotesTable
              companies={quotesCompanies}
              data={quotesData}
              onDelete={async (id) => {
                try {
                  const { deleteQuote } = await import("./api");
                  await deleteQuote(id);
                  setQuotesData((prev) => prev.filter((q) => q.id !== id));
                } catch (err) {
                  console.error("Failed to delete quote:", err);
                }
              }}
              onDownload={(id) => console.log("Download quote:", id)}
              onView={async (id) => {
                try {
                  const { fetchQuote } = await import("./api");
                  const quoteData = await fetchQuote(id);
                  // Load the quote into the editor
                  setQuoteId(id);
                  updateQuote(() => ({
                    estimateNumber: quoteData.estimate_number,
                    date: quoteData.date,
                    estimator: quoteData.estimator_name || "",
                    estimatorEmail: quoteData.estimator_email || "",
                    billTo: {
                      companyName: quoteData.company_name || "",
                      address: quoteData.company_address || "",
                      email: "",
                      phone: "",
                    },
                    jobInfo: {
                      siteName: quoteData.job_name || "",
                      address: quoteData.job_address || "",
                    },
                    sections:
                      typeof quoteData.sections === "string"
                        ? JSON.parse(quoteData.sections)
                        : quoteData.sections || [],
                    lineItems:
                      typeof quoteData.line_items === "string"
                        ? JSON.parse(quoteData.line_items)
                        : quoteData.line_items || [],
                    total: quoteData.total || 0,
                  }));
                  setActiveTab("editor");
                } catch (err) {
                  console.error("Failed to load quote:", err);
                }
              }}
            />
          )}
        </TabsContent>

        {/* Editor View */}
        <TabsContent className="flex-1 overflow-hidden" value="editor">
          <div className="flex h-full flex-col lg:flex-row">
            {/* Editor Panel */}
            <div className="w-full overflow-y-auto p-4 pb-28 lg:w-1/2 lg:pb-4">
              <Card className="relative border-border shadow-xl">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground">
                      Quote Editor
                    </CardTitle>
                    {/* Amendment Banner - inline with title */}
                    <AmendmentBanner
                      currentVersion={currentVersion}
                      isAmending={isAmending}
                      onDiscardAmendment={discardAmendment}
                      onFinalizeAmendment={finalizeAmendment}
                      onLock={lockQuote}
                      onStartAmendment={startAmendment}
                      pendingChangesCount={pendingChanges.length}
                      status={status}
                    />
                  </div>
                  {/* Toolbar with action buttons */}
                  <div className="mt-2 hidden items-center gap-2 lg:flex">
                    {/* Save status indicator */}
                    <span className="mr-2 text-muted-foreground text-xs">
                      {saveStatus === "saving" && (
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-status-saving" />
                          Saving...
                        </span>
                      )}
                      {saveStatus === "saved" && (
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-status-saved" />
                          Saved
                        </span>
                      )}
                      {saveStatus === "unsaved" && (
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                          Unsaved
                        </span>
                      )}
                    </span>
                    <Button
                      disabled={!pdfBlobUrl}
                      onClick={handlePreviewPdf}
                      size="sm"
                      variant="outline"
                    >
                      Preview
                    </Button>
                    <Button
                      disabled={!pdfBlobUrl}
                      onClick={handleDownloadPdf}
                      size="sm"
                    >
                      Download PDF
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Header Info - mirrors PDF header table */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label
                        className="text-muted-foreground text-xs"
                        htmlFor="estimator"
                      >
                        Estimator
                      </Label>
                      <EmployeeSelect
                        className="h-8 border-border bg-input text-foreground text-sm"
                        disabled={isLocked}
                        onChange={(name, email) =>
                          updateQuote((p) => ({
                            ...p,
                            estimator: name,
                            estimatorEmail: email,
                          }))
                        }
                        value={quote.estimator}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label
                        className="text-muted-foreground text-xs"
                        htmlFor="date"
                      >
                        Date
                      </Label>
                      <Popover>
                        <PopoverTrigger
                          className="flex h-8 items-center justify-between rounded-md border border-border bg-input px-3 text-foreground text-sm hover:bg-muted disabled:opacity-50"
                          disabled={isLocked}
                        >
                          <span>
                            {new Date(quote.date).toLocaleDateString("en-US", {
                              month: "2-digit",
                              day: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto border-border bg-card p-0">
                          <Calendar
                            defaultMonth={new Date(quote.date)}
                            mode="single"
                            onSelect={(date) => {
                              if (date) {
                                updateQuote((p) => ({
                                  ...p,
                                  date: date.toISOString(),
                                }));
                              }
                            }}
                            selected={new Date(quote.date)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid gap-1.5">
                      <Label
                        className="text-muted-foreground text-xs"
                        htmlFor="estimateNumber"
                      >
                        Estimate #
                      </Label>
                      <Input
                        className="h-8 border-border bg-input text-foreground text-sm"
                        disabled={isLocked}
                        id="estimateNumber"
                        onChange={(e) =>
                          updateQuote((p) => ({
                            ...p,
                            estimateNumber: e.target.value,
                          }))
                        }
                        value={quote.estimateNumber}
                      />
                    </div>
                  </div>

                  {/* Bill To and Job Info - side by side like PDF */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* Bill To */}
                    <div className="rounded border border-border bg-input/50 p-3">
                      <h3 className="mb-3 border-border border-b pb-1 font-semibold text-foreground text-sm">
                        Bill To:
                      </h3>
                      <div className="space-y-3">
                        <div className="grid gap-1.5">
                          <Label
                            className="text-muted-foreground text-xs"
                            htmlFor="companyName"
                          >
                            Company Name
                          </Label>
                          <ContractorAutocomplete
                            className="h-8 border-border bg-input text-foreground text-sm"
                            disabled={isLocked}
                            onChange={(name, contractor) => {
                              updateQuote((p) => ({
                                ...p,
                                billTo: {
                                  ...p.billTo,
                                  companyName: name,
                                  // Auto-fill email if contractor selected
                                  ...(contractor?.email && {
                                    email: contractor.email,
                                  }),
                                },
                              }));
                            }}
                            value={quote.billTo.companyName}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label
                            className="text-muted-foreground text-xs"
                            htmlFor="companyAddress"
                          >
                            Company Address
                          </Label>
                          <AddressAutocomplete
                            className="h-8 border-border bg-input text-foreground text-sm"
                            disabled={isLocked}
                            onChange={(address) =>
                              updateQuote((p) => ({
                                ...p,
                                billTo: { ...p.billTo, address },
                              }))
                            }
                            placeholder="Enter company address..."
                            value={quote.billTo.address}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Job Info */}
                    <div className="rounded border border-border bg-input/50 p-3">
                      <h3 className="mb-3 border-border border-b pb-1 font-semibold text-foreground text-sm">
                        Job Information:
                      </h3>
                      <div className="space-y-3">
                        <div className="grid gap-1.5">
                          <Label
                            className="text-muted-foreground text-xs"
                            htmlFor="jobName"
                          >
                            Job Name
                          </Label>
                          <Input
                            className="h-8 border-border bg-input text-foreground text-sm"
                            disabled={isLocked}
                            id="jobName"
                            onChange={(e) =>
                              updateQuote((p) => ({
                                ...p,
                                jobInfo: {
                                  ...p.jobInfo,
                                  siteName: e.target.value,
                                },
                              }))
                            }
                            value={quote.jobInfo.siteName}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label
                            className="text-muted-foreground text-xs"
                            htmlFor="jobAddress"
                          >
                            Job Address
                          </Label>
                          <AddressAutocomplete
                            className="h-8 border-border bg-input text-foreground text-sm"
                            disabled={isLocked}
                            onChange={(address) =>
                              updateQuote((p) => ({
                                ...p,
                                jobInfo: { ...p.jobInfo, address },
                              }))
                            }
                            placeholder="Enter job address..."
                            value={quote.jobInfo.address}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-semibold text-foreground text-sm">
                        Line Items
                      </h3>
                      <Button
                        onClick={addLineItem}
                        size="sm"
                        variant="secondary"
                      >
                        + Blank Item
                      </Button>
                    </div>

                    {/* Catalog Picker */}
                    <div className="mb-3 rounded border border-border bg-input/30 p-3">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
                        <div className="grid flex-1 gap-1.5">
                          <Label
                            className="text-muted-foreground text-xs"
                            htmlFor="catalogPicker"
                          >
                            Add from Catalog
                          </Label>
                          <CatalogCombobox
                            catalog={serviceCatalog}
                            className="border-border bg-input text-foreground"
                            onSelect={addFromCatalog}
                          />
                        </div>
                        <div className="grid w-full gap-1.5 sm:w-48">
                          <Label
                            className="text-muted-foreground text-xs"
                            htmlFor="sectionPicker"
                          >
                            Add Section
                          </Label>
                          <SectionCombobox
                            catalog={serviceCatalog}
                            className="border-border bg-input text-foreground"
                            onSelect={addCategoryItems}
                          />
                        </div>
                      </div>
                      {/* Current Sections with Remove Buttons */}
                      {quote.sections.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2 border-border border-t pt-2">
                          <span className="self-center text-muted-foreground text-xs">
                            Sections:
                          </span>
                          {quote.sections.map((section) => (
                            <div
                              className="flex items-center gap-1 rounded bg-muted px-2 py-1"
                              key={section.id}
                            >
                              <span className="text-foreground text-xs">
                                {section.name}
                              </span>
                              <Button
                                className="h-4 w-4 p-0 text-xs"
                                onClick={() => removeSection(section.id)}
                                size="sm"
                                variant="ghost"
                              >
                                X
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Line Items Table */}
                    <div className="space-y-1">
                      {/* Table Header */}
                      <div className="mb-1 hidden items-center px-1 text-muted-foreground text-xs md:flex">
                        <div className="w-9 shrink-0" />
                        <div className="ml-2 min-w-0 flex-2">Item</div>
                        <div className="ml-2 w-9 shrink-0" />
                        <div className="ml-2 min-w-0 flex-3">Description</div>
                        <div className="ml-2 w-20 text-left">Qty</div>
                        <div className="ml-2 w-16 shrink-0 text-center">
                          U/M
                        </div>
                        <div className="ml-2 w-24 text-left">Cost</div>
                        <div className="ml-2 w-28 shrink-0 text-right">
                          Total
                        </div>
                      </div>

                      {/* Line Items grouped by section */}
                      {(() => {
                        // Group items by section
                        const unsectioned = quote.lineItems.filter(
                          (i) => !i.sectionId
                        );
                        const sectionGroups = quote.sections.map((section) => ({
                          section,
                          items: quote.lineItems.filter(
                            (i) => i.sectionId === section.id
                          ),
                        }));

                        return (
                          <>
                            {/* Unsectioned items first */}
                            {unsectioned.map((item) => (
                              <div key={item.id}>{renderLineItem(item)}</div>
                            ))}

                            {/* Sectioned items with headers */}
                            {sectionGroups.map(
                              ({ section, items }) =>
                                items.length > 0 && (
                                  <div className="mt-3" key={section.id}>
                                    <div className="flex items-center justify-between rounded-t border border-border bg-input px-3 py-1.5 font-semibold text-foreground text-sm">
                                      <span>{section.name}</span>
                                      <Button
                                        className="h-6 w-6 p-0 text-xs"
                                        onClick={() =>
                                          removeSection(section.id)
                                        }
                                        size="sm"
                                        variant="ghost"
                                      >
                                        X
                                      </Button>
                                    </div>
                                    <div className="rounded-b border-border border-x border-b">
                                      {items.map((item) => (
                                        <div
                                          className="border-border border-b px-1 py-0.5 last:border-b-0"
                                          key={item.id}
                                        >
                                          {renderLineItem(item)}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                            )}
                          </>
                        );

                        function renderLineItem(item: LineItem) {
                          return (
                            <>
                              {/* Desktop view */}
                              <div
                                className={`hidden items-center md:flex ${item.isStruck ? "opacity-50" : ""}`}
                              >
                                <Button
                                  className="h-9 w-9 shrink-0 p-0"
                                  onClick={() => removeLineItem(item.id)}
                                  size="sm"
                                  variant="destructive"
                                >
                                  X
                                </Button>
                                <Input
                                  className={`ml-2 h-9 min-w-0 flex-2 border-border bg-input text-foreground text-sm ${item.isStruck ? "line-through" : ""}`}
                                  onChange={(e) =>
                                    updateLineItem(
                                      item.id,
                                      "item",
                                      e.target.value
                                    )
                                  }
                                  value={item.item}
                                />
                                <Button
                                  className={`ml-2 h-9 w-9 shrink-0 p-0 ${item.isStruck ? "bg-warning hover:bg-warning/80" : ""}`}
                                  onClick={() =>
                                    updateLineItem(
                                      item.id,
                                      "isStruck",
                                      !item.isStruck
                                    )
                                  }
                                  size="sm"
                                  title={
                                    item.isStruck
                                      ? "Remove strikethrough"
                                      : "Strikethrough item"
                                  }
                                  variant="secondary"
                                >
                                  <span className="line-through">S</span>
                                </Button>
                                <Input
                                  className={`ml-2 h-9 min-w-0 flex-3 border-border bg-input text-foreground text-sm ${item.isStruck ? "line-through" : ""}`}
                                  onChange={(e) =>
                                    updateLineItem(
                                      item.id,
                                      "description",
                                      e.target.value
                                    )
                                  }
                                  value={item.description}
                                />
                                <Input
                                  className="ml-2 h-9 w-20 border-border bg-input text-foreground text-sm"
                                  onChange={(e) =>
                                    updateLineItem(
                                      item.id,
                                      "qty",
                                      Number.parseFloat(e.target.value) || 0
                                    )
                                  }
                                  type="number"
                                  value={item.qty}
                                />
                                <div className="ml-2 flex h-9 w-16 shrink-0 items-center justify-center rounded border border-border bg-card text-foreground text-xs">
                                  {item.uom}
                                </div>
                                <Input
                                  className="ml-2 h-9 w-24 border-border bg-input text-left text-foreground text-sm"
                                  onChange={(e) =>
                                    updateLineItem(
                                      item.id,
                                      "cost",
                                      Number.parseFloat(e.target.value) || 0
                                    )
                                  }
                                  step="0.01"
                                  type="number"
                                  value={item.cost}
                                />
                                <div className="ml-2 flex h-9 w-28 shrink-0 items-center justify-end text-foreground text-sm">
                                  ${item.total.toFixed(2)}
                                </div>
                              </div>

                              {/* Mobile view */}
                              <div className="space-y-2 rounded border border-border bg-card/70 p-3 md:hidden">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground text-xs">
                                    Item
                                  </span>
                                  <div className="flex gap-1">
                                    <Button
                                      className={`h-8 w-8 p-0 ${item.isStruck ? "bg-warning hover:bg-warning/80" : ""}`}
                                      onClick={() =>
                                        updateLineItem(
                                          item.id,
                                          "isStruck",
                                          !item.isStruck
                                        )
                                      }
                                      size="sm"
                                      title={
                                        item.isStruck
                                          ? "Remove strikethrough"
                                          : "Strikethrough item"
                                      }
                                      variant="secondary"
                                    >
                                      <span className="line-through">S</span>
                                    </Button>
                                    <Button
                                      className="h-8 w-8 p-0"
                                      onClick={() => removeLineItem(item.id)}
                                      size="sm"
                                      variant="destructive"
                                    >
                                      X
                                    </Button>
                                  </div>
                                </div>
                                <Input
                                  className="h-10 border-border bg-input text-foreground text-sm"
                                  onChange={(e) =>
                                    updateLineItem(
                                      item.id,
                                      "item",
                                      e.target.value
                                    )
                                  }
                                  value={item.item}
                                />
                                <Input
                                  className="h-10 border-border bg-input text-foreground text-sm"
                                  onChange={(e) =>
                                    updateLineItem(
                                      item.id,
                                      "description",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Description"
                                  value={item.description}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    className="h-10 border-border bg-input text-foreground text-sm"
                                    inputMode="decimal"
                                    onChange={(e) =>
                                      updateLineItem(
                                        item.id,
                                        "qty",
                                        Number.parseFloat(e.target.value) || 0
                                      )
                                    }
                                    placeholder="Qty"
                                    type="number"
                                    value={item.qty}
                                  />
                                  <Input
                                    className="h-10 border-border bg-input text-foreground text-sm"
                                    onChange={(e) =>
                                      updateLineItem(
                                        item.id,
                                        "uom",
                                        e.target.value
                                      )
                                    }
                                    placeholder="U/M"
                                    value={item.uom}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    className="h-10 border-border bg-input text-foreground text-sm"
                                    inputMode="decimal"
                                    onChange={(e) =>
                                      updateLineItem(
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
                                  <div className="flex h-10 items-center justify-end text-foreground text-sm">
                                    Total: ${item.total.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </>
                          );
                        }
                      })()}

                      {quote.lineItems.length === 0 && (
                        <div className="py-8 text-center text-muted-foreground text-sm">
                          No items yet. Use the catalog picker above to add
                          items.
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* PDF Preview Panel */}
            <div className="hidden w-1/2 flex-col bg-muted lg:flex">
              {/* PDF Viewer */}
              <div className="flex-1">
                {pdfBlobUrl ? (
                  <iframe
                    height="100%"
                    src={pdfBlobUrl}
                    title="PDF Preview"
                    width="100%"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Generating PDF...
                  </div>
                )}
              </div>
            </div>

            {/* Mobile action bar */}
            <div className="fixed right-0 bottom-0 left-0 z-20 flex items-center gap-3 border-border border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
              <Button
                className="flex-1"
                disabled={!pdfBlobUrl}
                onClick={handlePreviewPdf}
                size="lg"
                variant="secondary"
              >
                Preview PDF
              </Button>
              <Button
                className="flex-1"
                disabled={!pdfBlobUrl}
                onClick={handleDownloadPdf}
                size="lg"
              >
                Finish Quote
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Settings View */}
        <TabsContent className="flex-1 p-4" value="settings">
          <Card className="max-w-2xl border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Formatting Options</Label>
                <p className="text-muted-foreground text-sm">
                  Settings coming soon...
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default App;
