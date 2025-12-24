import { useCallback, useState } from "react";
import type {
  ChangeRecord,
  LineItem,
  Quote,
  QuoteStatus,
  QuoteVersion,
  VersionedQuote,
} from "../types";

export type UseQuoteVersioningOptions = {
  initialQuote: Quote;
  initialStatus?: QuoteStatus;
};

export type UseQuoteVersioningResult = {
  quote: Quote;
  status: QuoteStatus;
  currentVersion: number;
  versions: QuoteVersion[];
  isLocked: boolean;
  isAmending: boolean;
  pendingChanges: ChangeRecord[];
  previousSnapshot: Quote | null;

  // Actions
  updateQuote: (updater: (prev: Quote) => Quote) => void;
  lockQuote: () => void;
  startAmendment: () => void;
  finalizeAmendment: () => void;
  discardAmendment: () => void;

  // Change tracking
  getLineItemChanges: (lineItemId: string) => ChangeRecord[];
  hasFieldChanged: (lineItemId: string, field: keyof LineItem) => boolean;
  getPreviousValue: (
    lineItemId: string,
    field: keyof LineItem
  ) => unknown | null;
};

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function compareLineItems(
  oldItems: LineItem[],
  newItems: LineItem[]
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const timestamp = new Date().toISOString();
  const oldMap = new Map(oldItems.map((item) => [item.id, item]));
  const newMap = new Map(newItems.map((item) => [item.id, item]));

  // Check for added items
  for (const [id] of newMap) {
    if (!oldMap.has(id)) {
      changes.push({
        type: "added",
        lineItemId: id,
        timestamp,
      });
    }
  }

  // Check for removed items
  for (const [id] of oldMap) {
    if (!newMap.has(id)) {
      changes.push({
        type: "removed",
        lineItemId: id,
        timestamp,
      });
    }
  }

  // Check for modified items
  for (const [id, newItem] of newMap) {
    const oldItem = oldMap.get(id);
    if (!oldItem) {
      continue;
    }

    const fields: (keyof LineItem)[] = [
      "item",
      "description",
      "qty",
      "uom",
      "cost",
      "total",
    ];

    for (const field of fields) {
      if (oldItem[field] !== newItem[field]) {
        changes.push({
          type: "modified",
          lineItemId: id,
          field,
          previousValue: oldItem[field],
          newValue: newItem[field],
          timestamp,
        });
      }
    }
  }

  return changes;
}

export function useQuoteVersioning({
  initialQuote,
  initialStatus = "draft",
}: UseQuoteVersioningOptions): UseQuoteVersioningResult {
  const [quote, setQuote] = useState<Quote>(initialQuote);
  const [status, setStatus] = useState<QuoteStatus>(initialStatus);
  const [versions, setVersions] = useState<QuoteVersion[]>([]);
  const [pendingChanges, setPendingChanges] = useState<ChangeRecord[]>([]);
  const [previousSnapshot, setPreviousSnapshot] = useState<Quote | null>(null);

  const currentVersion = versions.length;
  const isLocked = status === "locked";
  const isAmending = status === "amended" && previousSnapshot !== null;

  const updateQuote = useCallback(
    (updater: (prev: Quote) => Quote) => {
      if (isLocked) {
        console.warn("Cannot modify a locked quote. Start an amendment first.");
        return;
      }

      setQuote((prev) => {
        const updated = updater(prev);

        // Track changes during amendment
        if (previousSnapshot) {
          const changes = compareLineItems(
            previousSnapshot.lineItems,
            updated.lineItems
          );
          setPendingChanges(changes);
        }

        return updated;
      });
    },
    [isLocked, previousSnapshot]
  );

  const lockQuote = useCallback(() => {
    if (status === "locked") {
      return;
    }

    const timestamp = new Date().toISOString();
    const newVersion: QuoteVersion = {
      version: currentVersion + 1,
      status: "locked",
      createdAt: timestamp,
      lockedAt: timestamp,
      snapshot: deepClone(quote),
      changes: pendingChanges.length > 0 ? pendingChanges : undefined,
    };

    setVersions((prev) => [...prev, newVersion]);
    setStatus("locked");
    setPendingChanges([]);
    setPreviousSnapshot(null);
  }, [quote, status, currentVersion, pendingChanges]);

  const startAmendment = useCallback(() => {
    if (status !== "locked") {
      console.warn("Can only amend a locked quote.");
      return;
    }

    // Store the current snapshot for comparison
    setPreviousSnapshot(deepClone(quote));
    setStatus("amended");
    setPendingChanges([]);
  }, [quote, status]);

  const finalizeAmendment = useCallback(() => {
    if (!isAmending) {
      return;
    }

    const timestamp = new Date().toISOString();
    const newVersion: QuoteVersion = {
      version: currentVersion + 1,
      status: "locked",
      createdAt: timestamp,
      lockedAt: timestamp,
      snapshot: deepClone(quote),
      changes: pendingChanges,
    };

    setVersions((prev) => [...prev, newVersion]);
    setStatus("locked");
    setPendingChanges([]);
    setPreviousSnapshot(null);
  }, [quote, isAmending, currentVersion, pendingChanges]);

  const discardAmendment = useCallback(() => {
    if (!(isAmending && previousSnapshot)) {
      return;
    }

    setQuote(previousSnapshot);
    setStatus("locked");
    setPendingChanges([]);
    setPreviousSnapshot(null);
  }, [isAmending, previousSnapshot]);

  const getLineItemChanges = useCallback(
    (lineItemId: string): ChangeRecord[] =>
      pendingChanges.filter((c) => c.lineItemId === lineItemId),
    [pendingChanges]
  );

  const hasFieldChanged = useCallback(
    (lineItemId: string, field: keyof LineItem): boolean =>
      pendingChanges.some(
        (c) =>
          c.lineItemId === lineItemId &&
          (c.type === "added" ||
            c.type === "removed" ||
            (c.type === "modified" && c.field === field))
      ),
    [pendingChanges]
  );

  const getPreviousValue = useCallback(
    (lineItemId: string, field: keyof LineItem): unknown | null => {
      const change = pendingChanges.find(
        (c) =>
          c.lineItemId === lineItemId &&
          c.type === "modified" &&
          c.field === field
      );
      return change?.previousValue ?? null;
    },
    [pendingChanges]
  );

  return {
    quote,
    status,
    currentVersion,
    versions,
    isLocked,
    isAmending,
    pendingChanges,
    previousSnapshot,
    updateQuote,
    lockQuote,
    startAmendment,
    finalizeAmendment,
    discardAmendment,
    getLineItemChanges,
    hasFieldChanged,
    getPreviousValue,
  };
}

// Helper to convert to VersionedQuote for persistence
export function toVersionedQuote(
  quote: Quote,
  status: QuoteStatus,
  versions: QuoteVersion[]
): VersionedQuote {
  return {
    ...quote,
    status,
    currentVersion: versions.length,
    versions,
  };
}

// Helper to initialize from VersionedQuote
export function fromVersionedQuote(
  versionedQuote: VersionedQuote
): UseQuoteVersioningOptions {
  return {
    initialQuote: versionedQuote,
    initialStatus: versionedQuote.status,
  };
}
