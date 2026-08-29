// FILE: confirmationQueue.ts
// Purpose: Session-only FIFO confirmation coordination for focus mode.
// Layer: Web state

export type ConfirmationResult = "confirmed" | "cancelled" | "coalesced";

export interface ConfirmationRequestInput {
  readonly stableKey: string;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string | undefined;
  readonly destructive?: boolean | undefined;
}

export interface ConfirmationRequest extends ConfirmationRequestInput {
  readonly id: string;
  readonly occurrenceCount: number;
}

export interface ConfirmationQueueSnapshot {
  readonly current: ConfirmationRequest | null;
  readonly pendingCount: number;
}

export interface ConfirmationQueueManager {
  readonly request: (request: ConfirmationRequestInput) => Promise<ConfirmationResult>;
  readonly confirm: (requestId: string) => void;
  readonly cancel: (requestId: string) => void;
  readonly cancelAll: () => void;
  readonly getSnapshot: () => ConfirmationQueueSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

interface OwnedRequest {
  request: ConfirmationRequest;
  resolve: (result: ConfirmationResult) => void;
}

const EMPTY_SNAPSHOT: ConfirmationQueueSnapshot = { current: null, pendingCount: 0 };

export function createConfirmationQueueManager(): ConfirmationQueueManager {
  const listeners = new Set<() => void>();
  let queue: OwnedRequest[] = [];
  let snapshot = EMPTY_SNAPSHOT;
  let nextId = 1;

  const publish = (): void => {
    snapshot = {
      current: queue[0]?.request ?? null,
      pendingCount: Math.max(0, queue.length - 1),
    };
    for (const listener of listeners) listener();
  };

  const settle = (requestId: string, result: Exclude<ConfirmationResult, "coalesced">): void => {
    const index = queue.findIndex(({ request }) => request.id === requestId);
    if (index < 0) return;
    const [owned] = queue.splice(index, 1);
    owned?.resolve(result);
    publish();
  };

  return {
    request: (input) => {
      const matchingIndex = queue.findIndex(({ request }) => request.stableKey === input.stableKey);
      if (matchingIndex >= 0) {
        const owned = queue[matchingIndex]!;
        owned.request = {
          ...owned.request,
          ...input,
          id: owned.request.id,
          occurrenceCount: owned.request.occurrenceCount + 1,
        };
        publish();
        return Promise.resolve("coalesced");
      }

      return new Promise<ConfirmationResult>((resolve) => {
        queue.push({
          request: {
            ...input,
            id: `confirmation-${nextId++}`,
            occurrenceCount: 1,
          },
          resolve,
        });
        publish();
      });
    },
    confirm: (requestId) => {
      if (queue[0]?.request.id !== requestId) return;
      settle(requestId, "confirmed");
    },
    cancel: (requestId) => settle(requestId, "cancelled"),
    cancelAll: () => {
      const unresolved = queue;
      queue = [];
      for (const owned of unresolved) owned.resolve("cancelled");
      publish();
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const confirmationQueueManager = createConfirmationQueueManager();
