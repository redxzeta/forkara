// FILE: engine.ts
// Purpose: Idempotent local achievement event processing, persistence, and subscriptions.
// Layer: Web achievement runtime; failures are isolated from feature workflows.

import {
  ACHIEVEMENT_CATALOG,
  isAchievementId,
  RESET_TOOL_IDS,
  type AchievementProgress,
  type AchievementEvent,
  type AchievementId,
  type ResetToolId,
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
const EMPTY_RESET_TOOL_IDS: readonly ResetToolId[] = Object.freeze([]);
const EMPTY_ACHIEVEMENT_PROGRESS: AchievementProgress = Object.freeze({
  oracleUseCount: 0,
  resetToolIds: EMPTY_RESET_TOOL_IDS,
});

interface DecodedAchievementState {
  readonly snapshot: AchievementSnapshot;
  readonly progress: AchievementProgress;
}

const EMPTY_ACHIEVEMENT_STATE: DecodedAchievementState = Object.freeze({
  snapshot: EMPTY_ACHIEVEMENT_SNAPSHOT,
  progress: EMPTY_ACHIEVEMENT_PROGRESS,
});

function decodeState(value: string | null): DecodedAchievementState {
  if (!value) return EMPTY_ACHIEVEMENT_STATE;
  try {
    const decoded: unknown = JSON.parse(value);
    if (!decoded || typeof decoded !== "object") return EMPTY_ACHIEVEMENT_STATE;
    const payload = decoded as {
      version?: unknown;
      unlocks?: unknown;
      oracleUseCount?: unknown;
      resetToolIds?: unknown;
    };
    if (payload.version !== 1 || !Array.isArray(payload.unlocks)) {
      return EMPTY_ACHIEVEMENT_STATE;
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
    const persistedResetToolIds = new Set(
      Array.isArray(payload.resetToolIds)
        ? payload.resetToolIds.filter(
            (value): value is ResetToolId =>
              typeof value === "string" && RESET_TOOL_IDS.includes(value as ResetToolId),
          )
        : [],
    );
    const resetToolIds = RESET_TOOL_IDS.filter((id) => persistedResetToolIds.has(id));
    return {
      snapshot: unlocks.length > 0 ? Object.freeze(unlocks) : EMPTY_ACHIEVEMENT_SNAPSHOT,
      progress: Object.freeze({
        oracleUseCount:
          Number.isSafeInteger(payload.oracleUseCount) && Number(payload.oracleUseCount) >= 0
            ? Number(payload.oracleUseCount)
            : 0,
        resetToolIds: resetToolIds.length > 0 ? Object.freeze(resetToolIds) : EMPTY_RESET_TOOL_IDS,
      }),
    };
  } catch {
    return EMPTY_ACHIEVEMENT_STATE;
  }
}

function resetToolForEvent(event: AchievementEvent): ResetToolId | null {
  switch (event.type) {
    case "reset.oracle_used":
      return "oracle";
    case "reset.dependency_exorcism_succeeded":
      return "dependency-exorcism";
    case "reset.quota_parody_used":
      return "quota-parody";
    case "reset.hard_reset_succeeded":
      return "hard-reset";
    default:
      return null;
  }
}

function advanceProgress(
  current: AchievementProgress,
  event: AchievementEvent,
): AchievementProgress {
  const resetTool = resetToolForEvent(event);
  const oracleUseCount =
    event.type === "reset.oracle_used"
      ? Math.min(Number.MAX_SAFE_INTEGER, current.oracleUseCount + 1)
      : current.oracleUseCount;
  const resetToolIds = resetTool
    ? RESET_TOOL_IDS.filter((id) => id === resetTool || current.resetToolIds.includes(id))
    : current.resetToolIds;
  if (
    oracleUseCount === current.oracleUseCount &&
    resetToolIds.length === current.resetToolIds.length &&
    resetToolIds.every((id, index) => id === current.resetToolIds[index])
  ) {
    return current;
  }
  return Object.freeze({
    oracleUseCount,
    resetToolIds: Object.freeze(resetToolIds),
  });
}

export function createAchievementEngine(input: {
  readonly storage: AchievementStorage | null;
  readonly now?: () => Date;
}): AchievementEngine {
  const now = input.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  const initialState = (() => {
    try {
      return decodeState(input.storage?.getItem(STORAGE_KEY) ?? null);
    } catch {
      return EMPTY_ACHIEVEMENT_STATE;
    }
  })();
  let snapshot = initialState.snapshot;
  let progress = initialState.progress;

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
      input.storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          unlocks: snapshot,
          oracleUseCount: progress.oracleUseCount,
          resetToolIds: progress.resetToolIds,
        }),
      );
    } catch {
      // Achievement persistence is deliberately best-effort and never blocks its source action.
    }
  };

  return {
    getSnapshot: () => snapshot,
    record: (event) => {
      try {
        const nextProgress = advanceProgress(progress, event);
        const unlockedIds = new Set(snapshot.map((unlock) => unlock.id));
        const matchingDefinitions = ACHIEVEMENT_CATALOG.filter(
          (definition) =>
            !unlockedIds.has(definition.id) && definition.unlocks(event, nextProgress),
        );
        if (matchingDefinitions.length === 0 && nextProgress === progress) {
          return EMPTY_ACHIEVEMENT_SNAPSHOT;
        }
        const additions =
          matchingDefinitions.length === 0
            ? EMPTY_ACHIEVEMENT_SNAPSHOT
            : (() => {
                const unlockedAt = now().toISOString();
                return matchingDefinitions.map(
                  (definition): AchievementUnlock => ({ id: definition.id, unlockedAt }),
                );
              })();
        if (additions.length > 0) {
          const existingById = new Map(snapshot.map((unlock) => [unlock.id, unlock]));
          const additionsById = new Map(additions.map((unlock) => [unlock.id, unlock]));
          snapshot = Object.freeze(
            ACHIEVEMENT_CATALOG.flatMap((definition) => {
              const unlock = existingById.get(definition.id) ?? additionsById.get(definition.id);
              return unlock ? [unlock] : [];
            }),
          );
        }
        progress = nextProgress;
        persist();
        if (additions.length > 0) notify();
        return additions;
      } catch {
        return EMPTY_ACHIEVEMENT_SNAPSHOT;
      }
    },
    reset: () => {
      const changed =
        snapshot.length > 0 || progress.oracleUseCount > 0 || progress.resetToolIds.length > 0;
      snapshot = EMPTY_ACHIEVEMENT_SNAPSHOT;
      progress = EMPTY_ACHIEVEMENT_PROGRESS;
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
