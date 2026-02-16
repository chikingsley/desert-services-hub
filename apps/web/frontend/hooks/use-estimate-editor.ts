"use client";

import type {
  Catalog,
  CatalogItem,
  CatalogSubcategory,
} from "@lib/catalog/types";
import type {
  EditorEstimate,
  EditorLineItem,
  EditorSection,
} from "@lib/db/types";
import { useCallback } from "react";
import { useUndoRedo } from "@/apps/web/frontend/hooks/use-undo-redo";

export interface UseEstimateEditorOptions {
  initialEstimate?: EditorEstimate;
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

function createEmptyEstimate(): EditorEstimate {
  return {
    billTo: {
      companyName: "",
      address: "",
      email: "",
      phone: "",
    },
    date: new Date().toISOString(),
    estimateNumber: generateEstimateNumber(1),
    estimator: "",
    estimatorEmail: "",
    jobInfo: {
      siteName: "",
      address: "",
    },
    lineItems: [],
    sections: [],
    total: 0,
  };
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
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);
        return { ...prev, lineItems: updated, total };
      });
    },
    [updateEstimate]
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
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);
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
          const total = updated
            .filter((item) => !item.isStruck)
            .reduce((sum, item) => sum + item.total, 0);

          return { ...prev, lineItems: updated, sections: newSections, total };
        });
        return;
      }

      let catalogItem: CatalogItem | undefined;
      let subcategory: CatalogSubcategory | undefined;

      if (parts.length === 2) {
        const itemCode = parts[1];
        if (!itemCode) {
          return;
        }
        const result = findCatalogItem(categoryId, itemCode);
        if (result) {
          catalogItem = result.item;
          ({ subcategory } = result);
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

        if (catalogItem.code === "CM-003") {
          const siltFence = findCatalogItem(categoryId, "CM-004")?.item;
          const hasSiltFenceAlternate = siltFence
            ? updatedLineItems.some(
                (existing) =>
                  existing.item === siltFence.name &&
                  existing.sectionId === categoryId
              )
            : true;

          if (siltFence && !hasSiltFenceAlternate) {
            updatedLineItems = [
              ...updatedLineItems,
              {
                cost: siltFence.price,
                description: siltFence.description,
                id: crypto.randomUUID(),
                isAlternate: true,
                item: siltFence.name,
                qty: 0,
                sectionId: categoryId,
                total: 0,
                uom: siltFence.unit,
              },
            ];
          }
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

      const newItems: EditorLineItem[] = [];
      const timestamp = Date.now();

      if (category.items) {
        for (const item of category.items) {
          const qty = item.defaultQty ?? 1;
          newItems.push({
            cost: item.price,
            description: item.description,
            id: `${timestamp}-${item.code}`,
            item: item.name,
            qty,
            sectionId: categoryId,
            total: item.price * qty,
            uom: item.unit,
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
              cost: item.price,
              description: item.description,
              id: `${timestamp}-${item.code}`,
              item: item.name,
              qty,
              sectionId: categoryId,
              subcategoryId: sub.id,
              total: item.price * qty,
              uom: item.unit,
            });
          }
        }
      }

      if (newItems.length === 0) {
        return;
      }

      updateEstimate((prev) => {
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
            catalogCategoryId: categoryId,
            id: sectionId,
            name: category.name,
          },
        ];

        const updated = [...prev.lineItems, ...itemsWithSectionId];
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);

        return { ...prev, lineItems: updated, sections: newSections, total };
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
        const total = updatedItems
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);
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
        const total = updated
          .filter((item) => !item.isStruck)
          .reduce((sum, item) => sum + item.total, 0);

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
