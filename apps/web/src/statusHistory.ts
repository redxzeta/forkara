// FILE: statusHistory.ts
// Purpose: Session-only, bounded status history with stable-key coalescing.
// Layer: Web state
// Exports: status entry types, manager factory, and the application singleton

export type StatusHistoryTone = "info" | "success" | "warning" | "error" | "loading";

export type StatusHistoryActionKind = "action" | "undo" | "retry";

export interface StatusHistoryAction {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly kind?: StatusHistoryActionKind;
  readonly onAction: () => void | Promise<void>;
}

export interface StatusHistoryEntryInput {
  readonly stableKey?: string;
  readonly operationId?: string;
  readonly tone: StatusHistoryTone;
  readonly title: string;
  readonly summary?: string;
  readonly correctiveAction?: string;
  readonly technicalDetails?: string;
  readonly copyText?: string;
  readonly actions?: ReadonlyArray<StatusHistoryAction>;
}

export interface StatusHistoryEntry extends StatusHistoryEntryInput {
  readonly id: string;
  readonly occurrenceCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface StatusHistoryManager {
  readonly add: (entry: StatusHistoryEntryInput) => string;
  readonly dismiss: (entryId: string) => void;
  readonly clear: () => void;
  readonly getSnapshot: () => ReadonlyArray<StatusHistoryEntry>;
  readonly subscribe: (listener: () => void) => () => void;
}

function isMatchingEntry(current: StatusHistoryEntry, incoming: StatusHistoryEntryInput): boolean {
  return (
    (Boolean(incoming.operationId) && current.operationId === incoming.operationId) ||
    (Boolean(incoming.stableKey) && current.stableKey === incoming.stableKey)
  );
}

export function createStatusHistoryManager(options?: {
  readonly limit?: number;
  readonly now?: () => number;
}): StatusHistoryManager {
  const limit = Math.max(1, options?.limit ?? 100);
  const now = options?.now ?? Date.now;
  const listeners = new Set<() => void>();
  let nextId = 1;
  let entries: ReadonlyArray<StatusHistoryEntry> = [];

  const publish = (nextEntries: ReadonlyArray<StatusHistoryEntry>): void => {
    entries = nextEntries;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    add: (input) => {
      const updatedAt = now();
      const matchingIndex = entries.findIndex((entry) => isMatchingEntry(entry, input));

      if (matchingIndex >= 0) {
        const current = entries[matchingIndex]!;
        const updated: StatusHistoryEntry = {
          ...current,
          ...input,
          occurrenceCount: current.occurrenceCount + 1,
          updatedAt,
        };
        publish([updated, ...entries.filter((_, index) => index !== matchingIndex)]);
        return updated.id;
      }

      const id = `status-${nextId}`;
      nextId += 1;
      const created: StatusHistoryEntry = {
        ...input,
        id,
        occurrenceCount: 1,
        createdAt: updatedAt,
        updatedAt,
      };
      publish([created, ...entries].slice(0, limit));
      return id;
    },
    dismiss: (entryId) => {
      const nextEntries = entries.filter((entry) => entry.id !== entryId);
      if (nextEntries.length !== entries.length) {
        publish(nextEntries);
      }
    },
    clear: () => {
      if (entries.length > 0) {
        publish([]);
      }
    },
    getSnapshot: () => entries,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const statusHistoryManager = createStatusHistoryManager();
