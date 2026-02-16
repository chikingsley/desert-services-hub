"use client";

import type {
  Catalog,
  CatalogItem,
  CatalogSubcategory,
} from "@estimates/catalog/types";
import type {
  EditorEstimate,
  EditorLineItem,
  EditorSection,
} from "@lib/db/types";
import { useCallback } from "react";
import type { CatalogItemInfo } from "@/apps/web/frontend/lib/catalog-item-info";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import {
  collectCategoryLineItems,
  createEmptyEstimate,
  maybePairSiltFence,
  recalcTotal,
  resolveCatalogSelection,
} from "./estimate-editor-helpers";

export interface UseEstimateEditorOptions {
  initialEstimate?: EditorEstimate;
  catalog: Catalog;
}

export function useEstimateEditor({
  initialEstimate,
  catalog,
}: UseEstimateEditorOptions) {
  const {
    state: estimate,
    setState: setEstimate,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetEstimateState,
  } = useUndoRedo<EditorEstimate>(initialEstimate || createEmptyEstimate());

  const updateEstimate = useCallback(
    (updater: (prev: EditorEstimate) => EditorEstimate) => {
      setEstimate(updater);
    },
    [setEstimate]
  );

  const updateLineItem = useCallback(
    (
      id: string,
      field: keyof EditorLineItem,
      value: string | number | boolean
    ) => {
      updateEstimate((prev) => {
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
        const total = recalcTotal(updated);
        return { ...prev, lineItems: updated, total };
      });
    },
    [updateEstimate]
  );

  // Update a line item from a catalog selection (copies name, description, price, unit)
  const updateLineItemFromCatalog = useCallback(
    (id: string, catalogItem: CatalogItemInfo) => {
      updateEstimate((prev) => {
        const updated = prev.lineItems.map((item) => {
          if (item.id === id) {
            const newTotal = item.qty * catalogItem.price;
            return {
              ...item,
              cost: catalogItem.price,
              description: catalogItem.description,
              item: catalogItem.name,
              total: newTotal,
              uom: catalogItem.unit,
            };
          }
          return item;
        });
        const total = recalcTotal(updated);
        return { ...prev, lineItems: updated, total };
      });
    },
    [updateEstimate]
  );

  const addLineItem = useCallback(() => {
    const newItem: EditorLineItem = {
      cost: 0,
      description: "",
      id: String(Date.now()),
      item: "",
      qty: 1,
      total: 0,
      uom: "EA",
    };
    updateEstimate((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem],
    }));
  }, [updateEstimate]);

  const removeLineItem = useCallback(
    (id: string) => {
      updateEstimate((prev) => {
        const itemToRemove = prev.lineItems.find((item) => item.id === id);
        const updated = prev.lineItems.filter((item) => item.id !== id);
        const total = recalcTotal(updated);

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
          lineItems: updated,
          sections: updatedSections,
          total,
        };
      });
    },
    [updateEstimate]
  );

  const findCatalogItem = useCallback(
    (
      categoryId: string,
      code: string
    ): {
      item: CatalogItem;
      subcategory?: CatalogSubcategory;
    } | null => {
      const category = catalog.categories.find((c) => c.id === categoryId);
      if (!category) {
        return null;
      }

      if (category.items) {
        const item = category.items.find((i) => i.code === code);
        if (item) {
          return { item };
        }
      }
      if (category.subcategories) {
        for (const sub of category.subcategories) {
          const item = sub.items.find((i) => i.code === code);
          if (item) {
            return { item, subcategory: sub };
          }
        }
      }
      return null;
    },
    [catalog]
  );

  const addFromCatalog = useCallback(
    (value: string) => {
      const parts = value.split("::");
      if (parts.length < 2) {
        return;
      }

      const categoryId = parts[0];
      if (!categoryId) {
        return;
      }

      const category = catalog.categories.find((c) => c.id === categoryId);
      if (!category) {
        return;
      }

      if (parts[1] === "DUST-PERMIT") {
        const newItem: EditorLineItem = {
          cost: 0,
          description: "Enter acreage to calculate permit fee",
          id: String(Date.now()),
          item: "Dust Permit (by acreage)",
          qty: 1,
          sectionId: categoryId,
          total: 0,
          uom: "Each",
        };

        updateEstimate((prev) => {
          const sectionExists = prev.sections.some((s) => s.id === categoryId);
          const newSections = sectionExists
            ? prev.sections
            : [...prev.sections, { id: categoryId, name: category.name }];

          const updated = [...prev.lineItems, newItem];
          const total = recalcTotal(updated);

          return { ...prev, lineItems: updated, sections: newSections, total };
        });
        return;
      }

      const resolved = resolveCatalogSelection(
        parts,
        category,
        findCatalogItem
      );
      if (!resolved) {
        return;
      }
      const { catalogItem, subcategory } = resolved;

      updateEstimate((prev) => {
        let updatedLineItems = prev.lineItems;

        const existingItemIndex = updatedLineItems.findIndex(
          (item) =>
            item.item === catalogItem.name && item.sectionId === categoryId
        );

        if (existingItemIndex !== -1) {
          updatedLineItems = updatedLineItems.map((item, index) => {
            if (index === existingItemIndex) {
              const newQty = item.qty + (catalogItem.defaultQty ?? 1);
              return { ...item, qty: newQty, total: newQty * item.cost };
            }
            return item;
          });
        } else {
          const qty = catalogItem.defaultQty ?? 1;
          const newItem: EditorLineItem = {
            cost: catalogItem.price,
            description: catalogItem.description,
            id: String(Date.now()),
            item: catalogItem.name,
            qty,
            sectionId: categoryId,
            subcategoryId: subcategory?.id,
            total: catalogItem.price * qty,
            uom: catalogItem.unit,
          };
          updatedLineItems = [...updatedLineItems, newItem];
        }

        updatedLineItems = maybePairSiltFence(
          updatedLineItems,
          catalogItem,
          categoryId,
          findCatalogItem
        );

        const sectionExists = prev.sections.some((s) => s.id === categoryId);
        const newSections = sectionExists
          ? prev.sections
          : [...prev.sections, { id: categoryId, name: category.name }];

        const total = recalcTotal(updatedLineItems);

        return {
          ...prev,
          lineItems: updatedLineItems,
          sections: newSections,
          total,
        };
      });
    },
    [catalog, findCatalogItem, updateEstimate]
  );

  const addCategoryItems = useCallback(
    (categoryId: string) => {
      const category = catalog.categories.find((c) => c.id === categoryId);
      if (!category) {
        return;
      }

      const newItems = collectCategoryLineItems(
        category,
        Date.now(),
        categoryId
      );
      if (newItems.length === 0) {
        return;
      }

      updateEstimate((prev) => {
        const sectionId = crypto.randomUUID();
        const itemsWithSectionId = newItems.map((item) => ({
          ...item,
          sectionId,
        }));

        const newSections: EditorSection[] = [
          ...prev.sections,
          {
            catalogCategoryId: categoryId,
            id: sectionId,
            name: category.name,
          },
        ];

        const updated = [...prev.lineItems, ...itemsWithSectionId];
        return {
          ...prev,
          lineItems: updated,
          sections: newSections,
          total: recalcTotal(updated),
        };
      });
    },
    [catalog, updateEstimate]
  );

  const removeSection = useCallback(
    (sectionId: string) => {
      updateEstimate((prev) => {
        const updatedItems = prev.lineItems.filter(
          (item) => item.sectionId !== sectionId
        );
        const updatedSections = prev.sections.filter((s) => s.id !== sectionId);
        const total = recalcTotal(updatedItems);
        return {
          ...prev,
          lineItems: updatedItems,
          sections: updatedSections,
          total,
        };
      });
    },
    [updateEstimate]
  );

  const resetEstimate = useCallback(() => {
    resetEstimateState(createEmptyEstimate());
  }, [resetEstimateState]);

  const loadEstimate = useCallback(
    (newEstimate: EditorEstimate) => {
      resetEstimateState(newEstimate);
    },
    [resetEstimateState]
  );

  const updateSectionTitle = useCallback(
    (sectionId: string, title: string) => {
      updateEstimate((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, title } : s
        ),
      }));
    },
    [updateEstimate]
  );

  const duplicateSection = useCallback(
    (sectionId: string): string | null => {
      let newSectionId: string | null = null;

      updateEstimate((prev) => {
        const section = prev.sections.find((s) => s.id === sectionId);
        if (!section) {
          return prev;
        }

        newSectionId = crypto.randomUUID();
        const sectionItems = prev.lineItems.filter(
          (item) => item.sectionId === sectionId
        );

        // Create new section with copied properties
        const newSection: EditorSection = {
          catalogCategoryId: section.catalogCategoryId,
          id: newSectionId,
          name: section.name,
          title: section.title
            ? `${section.title} (Copy)`
            : `${section.name} (Copy)`,
        };

        // Duplicate all items with new IDs and new section ID
        const timestamp = Date.now();
        const newItems: EditorLineItem[] = sectionItems.map((item, index) => ({
          ...item,
          id: `${timestamp}-${index}`,
          sectionId: newSectionId as string,
        }));

        const updated = [...prev.lineItems, ...newItems];
        const total = recalcTotal(updated);

        return {
          ...prev,
          lineItems: updated,
          sections: [...prev.sections, newSection],
          total,
        };
      });

      return newSectionId;
    },
    [updateEstimate]
  );

  return {
    estimate,
    updateEstimate,
    updateLineItem,
    updateLineItemFromCatalog,
    addLineItem,
    removeLineItem,
    addFromCatalog,
    addCategoryItems,
    removeSection,
    resetEstimate,
    loadEstimate,
    updateSectionTitle,
    duplicateSection,
    // Undo/redo
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
