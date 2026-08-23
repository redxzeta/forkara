// FILE: engine.ts
// Purpose: Idempotent local achievement event processing, persistence, and subscriptions.
// Layer: Web achievement runtime; failures are isolated from feature workflows.

import {
  ACHIEVEMENT_CATALOG,
  isAchievementId,
  type AchievementEvent,
  type AchievementId,
} from "./catalog";

export interface AchievementUnlock {
  readonly id: AchievementId;
  readonly unlockedAt: string;
}

export type AchievementSnapshot = readonly AchievementUnlock[];

interface AchievementStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

interface AchievementEngine {
  readonly getSnapshot: () => AchievementSnapshot;
  readonly record: (event: AchievementEvent) => readonly AchievementUnlock[];
  readonly reset: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

const STORAGE_KEY = "synara:achievements:v1";
export const EMPTY_ACHIEVEMENT_SNAPSHOT: AchievementSnapshot = Object.freeze([]);

function decodeUnlocks(value: string | null): AchievementSnapshot {
  if (!value) return EMPTY_ACHIEVEMENT_SNAPSHOT;
  try {
    const decoded: unknown = JSON.parse(value);
    if (!decoded || typeof decoded !== "object") return EMPTY_ACHIEVEMENT_SNAPSHOT;
    const payload = decoded as { version?: unknown; unlocks?: unknown };
    if (payload.version !== 1 || !Array.isArray(payload.unlocks)) {
      return EMPTY_ACHIEVEMENT_SNAPSHOT;
    }
    const byId = new Map<AchievementId, AchievementUnlock>();
    for (const candidate of payload.unlocks) {
      if (!candidate || typeof candidate !== "object") continue;
      const record = candidate as { id?: unknown; unlockedAt?: unknown };
      if (
        typeof record.id !== "string" ||
        !isAchievementId(record.id) ||
        typeof record.unlockedAt !== "string" ||
        !Number.isFinite(Date.parse(record.unlockedAt)) ||
        byId.has(record.id)
      ) {
        continue;
      }
      byId.set(record.id, { id: record.id, unlockedAt: record.unlockedAt });
    }
    const unlocks = ACHIEVEMENT_CATALOG.flatMap((definition) => {
      const unlock = byId.get(definition.id);
      return unlock ? [unlock] : [];
    });
    return unlocks.length > 0 ? Object.freeze(unlocks) : EMPTY_ACHIEVEMENT_SNAPSHOT;
  } catch {
    return EMPTY_ACHIEVEMENT_SNAPSHOT;
  }
}

export function createAchievementEngine(input: {
  readonly storage: AchievementStorage | null;
  readonly now?: () => Date;
}): AchievementEngine {
  const now = input.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  let snapshot = (() => {
    try {
      return decodeUnlocks(input.storage?.getItem(STORAGE_KEY) ?? null);
    } catch {
      return EMPTY_ACHIEVEMENT_SNAPSHOT;
    }
  })();

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // View subscribers cannot make the source feature action fail.
      }
    }
  };
  const persist = () => {
    try {
      input.storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, unlocks: snapshot }));
    } catch {
      // Achievement persistence is deliberately best-effort and never blocks its source action.
    }
  };

  return {
    getSnapshot: () => snapshot,
    record: (event) => {
      const unlockedIds = new Set(snapshot.map((unlock) => unlock.id));
      const matchingDefinitions = ACHIEVEMENT_CATALOG.filter(
        (definition) => !unlockedIds.has(definition.id) && definition.unlocks(event),
      );
      if (matchingDefinitions.length === 0) return EMPTY_ACHIEVEMENT_SNAPSHOT;
      const unlockedAt = now().toISOString();
      const additions = matchingDefinitions.map(
        (definition): AchievementUnlock => ({
          id: definition.id,
          unlockedAt,
        }),
      );
      const existingById = new Map(snapshot.map((unlock) => [unlock.id, unlock]));
      const additionsById = new Map(additions.map((unlock) => [unlock.id, unlock]));
      snapshot = Object.freeze(
        ACHIEVEMENT_CATALOG.flatMap((definition) => {
          const unlock = existingById.get(definition.id) ?? additionsById.get(definition.id);
          return unlock ? [unlock] : [];
        }),
      );
      persist();
      notify();
      return additions;
    },
    reset: () => {
      const changed = snapshot.length > 0;
      snapshot = EMPTY_ACHIEVEMENT_SNAPSHOT;
      try {
        input.storage?.removeItem(STORAGE_KEY);
      } catch {
        // Reset remains usable for the current session when storage is unavailable.
      }
      if (changed) notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let browserEngine: AchievementEngine | null = null;

function getBrowserEngine(): AchievementEngine | null {
  if (typeof window === "undefined") return null;
  if (browserEngine) return browserEngine;
  let storage: AchievementStorage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    // Some privacy modes expose window but reject access to localStorage itself.
  }
  browserEngine = createAchievementEngine({ storage });
  return browserEngine;
}

export function recordAchievementEvent(event: AchievementEvent): readonly AchievementUnlock[] {
  try {
    return getBrowserEngine()?.record(event) ?? EMPTY_ACHIEVEMENT_SNAPSHOT;
  } catch {
    return EMPTY_ACHIEVEMENT_SNAPSHOT;
  }
}

export function getAchievementSnapshot(): AchievementSnapshot {
  return getBrowserEngine()?.getSnapshot() ?? EMPTY_ACHIEVEMENT_SNAPSHOT;
}

export function subscribeToAchievementState(listener: () => void): () => void {
  return getBrowserEngine()?.subscribe(listener) ?? (() => undefined);
}

/** Development/test reset helper. Achievement failures never escape into feature workflows. */
export function resetAchievementState(): void {
  try {
    getBrowserEngine()?.reset();
  } catch {
    // No-op by design.
  }
}
