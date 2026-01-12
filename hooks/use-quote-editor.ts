"use client";

import { useCallback } from "react";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import type {
  Catalog,
  CatalogServiceItem,
  CatalogSubcategory,
  EditorLineItem,
  EditorQuote,
  EditorSection,
} from "@/lib/types";

export interface UseQuoteEditorOptions {
  initialQuote?: EditorQuote;
  catalog: Catalog;
}

function generateEstimateNumber(sequenceNum = 1): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const seq = String(sequenceNum).padStart(2, "0");
  return `${yy}${mm}${dd}${seq}`;
}

function createEmptyQuote(): EditorQuote {
  return {
    estimateNumber: generateEstimateNumber(1),
    date: new Date().toISOString(),
    estimator: "",
    estimatorEmail: "",
    billTo: {
      companyName: "",
      address: "",
      email: "",
      phone: "",
    },
    jobInfo: {
      siteName: "",
      address: "",
    },
    sections: [],
    lineItems: [],
    total: 0,
  };
}

export function useQuoteEditor({
  initialQuote,
  catalog,
}: UseQuoteEditorOptions) {
  const {
    state: quote,
    setState: setQuote,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetQuoteState,
  } = useUndoRedo<EditorQuote>(initialQuote || createEmptyQuote());

  const updateQuote = useCallback(
    (updater: (prev: EditorQuote) => EditorQuote) => {
      setQuote(updater);
    },
    [setQuote]
  );

  const updateLineItem = useCallback(
    (
      id: string,
      field: keyof EditorLineItem,
      value: string | number | boolean
    ) => {
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
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);
        return { ...prev, lineItems: updated, total };
      });
    },
    [updateQuote]
  );

  // Update a line item from a catalog selection (copies name, description, price, unit)
  const updateLineItemFromCatalog = useCallback(
    (
      id: string,
      catalogItem: {
        name: string;
        description: string;
        price: number;
        unit: string;
      }
    ) => {
      updateQuote((prev) => {
        const updated = prev.lineItems.map((item) => {
          if (item.id === id) {
            const newTotal = item.qty * catalogItem.price;
            return {
              ...item,
              item: catalogItem.name,
              description: catalogItem.description,
              cost: catalogItem.price,
              uom: catalogItem.unit,
              total: newTotal,
            };
          }
          return item;
        });
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);
        return { ...prev, lineItems: updated, total };
      });
    },
    [updateQuote]
  );

  const addLineItem = useCallback(() => {
    const newItem: EditorLineItem = {
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
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);

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

  const findCatalogItem = useCallback(
    (
      categoryId: string,
      code: string
    ): {
      item: CatalogServiceItem;
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

          return { ...prev, sections: newSections, lineItems: updated, total };
        });
        return;
      }

      let catalogItem: CatalogServiceItem | undefined;
      let subcategory: CatalogSubcategory | undefined;

      if (parts.length === 2) {
        const itemCode = parts[1];
        if (!itemCode) {
          return;
        }
        const result = findCatalogItem(categoryId, itemCode);
        if (result) {
          catalogItem = result.item;
          subcategory = result.subcategory;
        }
      } else {
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

      // Note: pick-one is just a UI hint, we don't enforce it by auto-removing items
      // Users manage duplicates manually

      updateQuote((prev) => {
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
    },
    [catalog, findCatalogItem, updateQuote]
  );

  const addCategoryItems = useCallback(
    (categoryId: string) => {
      const category = catalog.categories.find((c) => c.id === categoryId);
      if (!category) {
        return;
      }

      const newItems: EditorLineItem[] = [];
      const timestamp = Date.now();

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

      if (category.subcategories) {
        for (const sub of category.subcategories) {
          if (sub.hidden) {
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
        // Generate unique section ID to allow multiple sections of same category
        const sectionId = crypto.randomUUID();

        // Update all new items to use the new section ID
        const itemsWithSectionId = newItems.map((item) => ({
          ...item,
          sectionId,
        }));

        const newSections: EditorSection[] = [
          ...prev.sections,
          {
            id: sectionId,
            name: category.name,
            catalogCategoryId: categoryId,
          },
        ];

        const updated = [...prev.lineItems, ...itemsWithSectionId];
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);

        return { ...prev, sections: newSections, lineItems: updated, total };
      });
    },
    [catalog, updateQuote]
  );

  const removeSection = useCallback(
    (sectionId: string) => {
      updateQuote((prev) => {
        const updatedItems = prev.lineItems.filter(
          (item) => item.sectionId !== sectionId
        );
        const updatedSections = prev.sections.filter((s) => s.id !== sectionId);
        const total = updatedItems
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);
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

  const resetQuote = useCallback(() => {
    resetQuoteState(createEmptyQuote());
  }, [resetQuoteState]);

  const loadQuote = useCallback(
    (newQuote: EditorQuote) => {
      resetQuoteState(newQuote);
    },
    [resetQuoteState]
  );

  const updateSectionTitle = useCallback(
    (sectionId: string, title: string) => {
      updateQuote((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, title } : s
        ),
      }));
    },
    [updateQuote]
  );

  const duplicateSection = useCallback(
    (sectionId: string): string | null => {
      let newSectionId: string | null = null;

      updateQuote((prev) => {
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
          id: newSectionId,
          name: section.name,
          title: section.title
            ? `${section.title} (Copy)`
            : `${section.name} (Copy)`,
          catalogCategoryId: section.catalogCategoryId,
        };

        // Duplicate all items with new IDs and new section ID
        const timestamp = Date.now();
        const newItems: EditorLineItem[] = sectionItems.map((item, index) => ({
          ...item,
          id: `${timestamp}-${index}`,
          sectionId: newSectionId as string,
        }));

        const updated = [...prev.lineItems, ...newItems];
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);

        return {
          ...prev,
          sections: [...prev.sections, newSection],
          lineItems: updated,
          total,
        };
      });

      return newSectionId;
    },
    [updateQuote]
  );

  return {
    quote,
    updateQuote,
    updateLineItem,
    updateLineItemFromCatalog,
    addLineItem,
    removeLineItem,
    addFromCatalog,
    addCategoryItems,
    removeSection,
    resetQuote,
    loadQuote,
    updateSectionTitle,
    duplicateSection,
    // Undo/redo
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
