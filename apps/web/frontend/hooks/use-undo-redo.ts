import { useCallback, useReducer } from "react";

interface UseUndoRedoOptions {
  /** Maximum history size */
  maxHistory?: number;
}

type SetStateAction<T> = T | ((prevState: T) => T);

interface UseUndoRedoReturn<T> {
  /** Can redo? */
  canRedo: boolean;
  /** Can undo? */
  canUndo: boolean;
  /** Redo to next state */
  redo: () => void;
  /** Clear history and set initial state */
  reset: (value: T) => void;
  /** Set state and add to history (supports function updater like useState) */
  setState: (value: SetStateAction<T>) => void;
  /** Current state */
  state: T;
  /** Undo to previous state */
  undo: () => void;
}

interface HistoryState<T> {
  future: T[];
  past: T[];
  present: T;
}

type HistoryAction<T> =
  | { type: "SET"; value: SetStateAction<T> }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; value: T };

function createReducer<T>(maxHistory: number) {
  return function historyReducer(
    state: HistoryState<T>,
    action: HistoryAction<T>
  ): HistoryState<T> {
    switch (action.type) {
      case "SET": {
        const newValue =
          typeof action.value === "function"
            ? (action.value as (prev: T) => T)(state.present)
            : action.value;

        // Don't add to history if value hasn't changed
        if (newValue === state.present) {
          return state;
        }

        const newPast = [...state.past, state.present];
        // Limit history size
        if (newPast.length > maxHistory) {
          newPast.shift();
        }

        return {
          future: [],
          past: newPast,
          present: newValue, // Clear future on new action
        };
      }

      case "UNDO": {
        if (state.past.length === 0) {
          return state;
        }
        const previous = state.past.at(-1) as T;
        const newPast = state.past.slice(0, -1);
        return {
          future: [state.present, ...state.future],
          past: newPast,
          present: previous,
        };
      }

      case "REDO": {
        const next = state.future[0];
        if (!next) {
          return state;
        }
        const newFuture = state.future.slice(1);
        return {
          future: newFuture,
          past: [...state.past, state.present],
          present: next,
        };
      }

      case "RESET": {
        return {
          future: [],
          past: [],
          present: action.value,
        };
      }

      default: {
        return state;
      }
    }
  };
}

/**
 * Hook for managing state with undo/redo functionality.
 * Uses useReducer for atomic state updates.
 */
export function useUndoRedo<T>(
  initialState: T,
  options: UseUndoRedoOptions = {}
): UseUndoRedoReturn<T> {
  const { maxHistory = 50 } = options;

  const [historyState, dispatch] = useReducer(createReducer<T>(maxHistory), {
    future: [],
    past: [],
    present: initialState,
  });

  const setState = useCallback((value: SetStateAction<T>) => {
    dispatch({ type: "SET", value });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "UNDO" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "REDO" });
  }, []);

  const reset = useCallback((value: T) => {
    dispatch({ type: "RESET", value });
  }, []);

  return {
    canRedo: historyState.future.length > 0,
    canUndo: historyState.past.length > 0,
    redo,
    reset,
    setState,
    state: historyState.present,
    undo,
  };
}
