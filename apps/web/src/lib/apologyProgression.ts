// FILE: apologyProgression.ts
// Purpose: Defines the satirical apology ladder and its local per-project state.
// Layer: Web-only parody state; no repository or external-service side effects.

export const APOLOGY_PROGRESSION_STAGES = [
  {
    id: "denial",
    title: "Denial",
    copy: "This repository simply appeared one morning, complete with familiar commit history.",
  },
  {
    id: "clarification",
    title: "Clarification",
    copy: "It is not a fork; it merely shares an unusually specific creative lineage.",
  },
  {
    id: "double-down",
    title: "Double Down",
    copy: "Matching history is apparently just parallel invention with excellent timing.",
  },
  {
    id: "fork-isnt-that-bad",
    title: "The Fork Isn't That Bad",
    copy: "Forks are normal, useful, and considerably less awkward when acknowledged.",
  },
  {
    id: "notes-app-screenshot",
    title: "Notes App Screenshot",
    copy: "A solemn monochrome rectangle has been drafted. The Notes app has done all it can.",
  },
  {
    id: "actual-apology",
    title: "Actual Apology",
    copy: "Accountability beats evasion: acknowledge the fork, credit upstream work, preserve required notices, and explain what changed.",
  },
] as const;

export type ApologyProgressionStage = (typeof APOLOGY_PROGRESSION_STAGES)[number];

const STORAGE_KEY = "synara:apology-progression:v1";
const FIRST_STAGE_INDEX = 0;
export const FINAL_APOLOGY_STAGE_INDEX = APOLOGY_PROGRESSION_STAGES.length - 1;

function decodeStageIndexes(value: string | null): Map<string, number> {
  const decoded: unknown = JSON.parse(value ?? "{}");
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return new Map();
  return new Map(
    Object.entries(decoded).filter(
      (entry): entry is [string, number] =>
        entry[0].length > 0 &&
        Number.isInteger(entry[1]) &&
        entry[1] >= FIRST_STAGE_INDEX &&
        entry[1] <= FINAL_APOLOGY_STAGE_INDEX,
    ),
  );
}

export function clampApologyStageIndex(value: number): number {
  if (!Number.isFinite(value)) return FIRST_STAGE_INDEX;
  return Math.min(FINAL_APOLOGY_STAGE_INDEX, Math.max(FIRST_STAGE_INDEX, Math.trunc(value)));
}

export function nextApologyStageIndex(current: number): number {
  return clampApologyStageIndex(current + 1);
}

export function readApologyStageIndex(
  projectId: string,
  storage: Pick<Storage, "getItem">,
): number {
  try {
    return decodeStageIndexes(storage.getItem(STORAGE_KEY)).get(projectId) ?? FIRST_STAGE_INDEX;
  } catch {
    return FIRST_STAGE_INDEX;
  }
}

export function writeApologyStageIndex(
  projectId: string,
  stageIndex: number,
  storage: Pick<Storage, "getItem" | "setItem">,
): boolean {
  try {
    const stageIndexes = decodeStageIndexes(storage.getItem(STORAGE_KEY));
    const normalizedIndex = clampApologyStageIndex(stageIndex);
    if (normalizedIndex === FIRST_STAGE_INDEX) stageIndexes.delete(projectId);
    else stageIndexes.set(projectId, normalizedIndex);
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        Object.fromEntries(
          [...stageIndexes].toSorted(([left], [right]) => left.localeCompare(right)),
        ),
      ),
    );
    return true;
  } catch {
    return false;
  }
}
