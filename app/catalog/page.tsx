"use client";

import { ChevronDown, ChevronRight, Package, Search } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  catalog,
  getAllItems,
  takeoffBundles,
} from "@/services/quoting/catalog";

export default function CatalogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [expandedSubcategories, setExpandedSubcategories] = useState<
    Set<string>
  >(new Set());

  const allItems = getAllItems();
  const totalCategories = catalog.categories.length;
  const totalItems = allItems.length;
  const totalBundles = takeoffBundles.length;

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSubcategory = (id: string) => {
    setExpandedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter categories based on search
  const filteredCategories = catalog.categories
    .map((category) => {
      const query = searchQuery.toLowerCase();

      // Check if any direct items match
      const matchingItems =
        category.items?.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.code.toLowerCase().includes(query) ||
            item.description?.toLowerCase().includes(query)
        ) ?? [];

      // Check subcategories
      const matchingSubcategories =
        category.subcategories?.map((sub) => ({
          ...sub,
          items: sub.items.filter(
            (item) =>
              item.name.toLowerCase().includes(query) ||
              item.code.toLowerCase().includes(query) ||
              item.description?.toLowerCase().includes(query)
          ),
        })) ?? [];

      const hasMatchingSubcatItems = matchingSubcategories.some(
        (sub) => sub.items.length > 0
      );

      const categoryMatches = category.name.toLowerCase().includes(query);

      if (
        !searchQuery ||
        categoryMatches ||
        matchingItems.length > 0 ||
        hasMatchingSubcatItems
      ) {
        return {
          ...category,
          items: searchQuery ? matchingItems : category.items,
          subcategories: searchQuery
            ? matchingSubcategories.filter((sub) => sub.items.length > 0)
            : category.subcategories,
        };
      }
      return null;
    })
    .filter(Boolean);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Catalog" }]}
        title="Service Catalog"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="page-transition">
          {/* Stats Bar */}
          <div className="mb-8 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <p className="text-muted-foreground text-sm">Categories</p>
              <p className="font-display font-semibold text-2xl">
                {totalCategories}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <p className="text-muted-foreground text-sm">Total Items</p>
              <p className="font-display font-semibold text-2xl">
                {totalItems}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <p className="text-muted-foreground text-sm">Takeoff Bundles</p>
              <p className="font-display font-semibold text-2xl text-primary">
                {totalBundles}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items by name, code, or description..."
              value={searchQuery}
            />
          </div>

          {/* Takeoff Bundles Section */}
          <div className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-lg">
              <Package className="h-5 w-5" />
              Takeoff Bundles
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {takeoffBundles.map((bundle) => (
                <div
                  className="rounded-lg border border-border/50 bg-card p-4"
                  key={bundle.id}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: bundle.color }}
                    />
                    <span className="font-medium">{bundle.name}</span>
                    <Badge className="ml-auto" variant="outline">
                      {bundle.toolType}
                    </Badge>
                  </div>
                  <p className="mb-2 text-muted-foreground text-sm">
                    {bundle.description}
                  </p>
                  <div className="text-muted-foreground text-xs">
                    {bundle.items.length} items • Unit: {bundle.unit}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            {filteredCategories.map((category) => {
              if (!category) {
                return null;
              }
              const isExpanded = expandedCategories.has(category.id);
              const itemCount =
                (category.items?.length ?? 0) +
                (category.subcategories?.reduce(
                  (acc, sub) => acc + sub.items.length,
                  0
                ) ?? 0);

              return (
                <div
                  className="rounded-lg border border-border/50 bg-card"
                  key={category.id}
                >
                  {/* Category Header */}
                  <button
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50"
                    onClick={() => toggleCategory(category.id)}
                    type="button"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="font-semibold">{category.name}</span>
                    <Badge className="ml-auto" variant="secondary">
                      {itemCount} items
                    </Badge>
                  </button>

                  {/* Category Content */}
                  {isExpanded && (
                    <div className="border-border/50 border-t px-4 pb-4">
                      {/* Direct items */}
                      {category.items && category.items.length > 0 && (
                        <div className="mt-4">
                          <table className="w-full">
                            <thead>
                              <tr className="border-border/50 border-b text-left text-muted-foreground text-sm">
                                <th className="pb-2 font-medium">Code</th>
                                <th className="pb-2 font-medium">Name</th>
                                <th className="pb-2 font-medium">Price</th>
                                <th className="pb-2 font-medium">Unit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {category.items.map((item) => (
                                <tr
                                  className="border-border/50 border-b last:border-0"
                                  key={item.code}
                                >
                                  <td className="py-2 font-mono text-sm">
                                    {item.code}
                                  </td>
                                  <td className="py-2">
                                    <div>{item.name}</div>
                                    {item.description && (
                                      <div className="text-muted-foreground text-xs">
                                        {item.description}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 font-medium">
                                    {formatCurrency(item.price)}
                                  </td>
                                  <td className="py-2 text-muted-foreground">
                                    {item.unit}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Subcategories */}
                      {category.subcategories?.map((subcategory) => {
                        const subExpanded = expandedSubcategories.has(
                          subcategory.id
                        );
                        return (
                          <div className="mt-4" key={subcategory.id}>
                            <button
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-muted/50",
                                subExpanded && "bg-muted/30"
                              )}
                              onClick={() => toggleSubcategory(subcategory.id)}
                              type="button"
                            >
                              {subExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm">
                                {subcategory.name}
                              </span>
                              <Badge className="ml-auto" variant="outline">
                                {subcategory.items.length}
                              </Badge>
                            </button>

                            {subExpanded && (
                              <table className="mt-2 w-full">
                                <thead>
                                  <tr className="border-border/50 border-b text-left text-muted-foreground text-sm">
                                    <th className="pb-2 pl-8 font-medium">
                                      Code
                                    </th>
                                    <th className="pb-2 font-medium">Name</th>
                                    <th className="pb-2 font-medium">Price</th>
                                    <th className="pb-2 font-medium">Unit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subcategory.items.map((item) => (
                                    <tr
                                      className="border-border/50 border-b last:border-0"
                                      key={item.code}
                                    >
                                      <td className="py-2 pl-8 font-mono text-sm">
                                        {item.code}
                                      </td>
                                      <td className="py-2">
                                        <div>{item.name}</div>
                                        {item.description && (
                                          <div className="text-muted-foreground text-xs">
                                            {item.description}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-2 font-medium">
                                        {formatCurrency(item.price)}
                                      </td>
                                      <td className="py-2 text-muted-foreground">
                                        {item.unit}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
