import { describe, expect, it } from "vitest";

import {
  APOLOGY_PROGRESSION_STAGES,
  FINAL_APOLOGY_STAGE_INDEX,
  nextApologyStageIndex,
  readApologyStageIndex,
  writeApologyStageIndex,
} from "./apologyProgression";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    value: () => value,
  };
}

describe("apologyProgression", () => {
  it("defines the complete satirical progression in issue order", () => {
    expect(APOLOGY_PROGRESSION_STAGES.map((stage) => stage.title)).toEqual([
      "Denial",
      "Clarification",
      "Double Down",
      "The Fork Isn't That Bad",
      "Notes App Screenshot",
      "Actual Apology",
    ]);
    expect(APOLOGY_PROGRESSION_STAGES.at(-1)?.copy).toContain("credit upstream work");
  });

  it("advances deterministically and stops at the final stage", () => {
    expect(nextApologyStageIndex(0)).toBe(1);
    expect(nextApologyStageIndex(FINAL_APOLOGY_STAGE_INDEX)).toBe(FINAL_APOLOGY_STAGE_INDEX);
  });

  it("persists per-project progress locally and removes reset state", () => {
    const storage = memoryStorage();

    expect(readApologyStageIndex("project-1", storage)).toBe(0);
    expect(writeApologyStageIndex("project-1", 3, storage)).toBe(true);
    expect(writeApologyStageIndex("project-2", 2, storage)).toBe(true);
    expect(readApologyStageIndex("project-1", storage)).toBe(3);
    expect(readApologyStageIndex("project-2", storage)).toBe(2);

    expect(writeApologyStageIndex("project-1", 0, storage)).toBe(true);
    expect(storage.value()).toBe('{"project-2":2}');
  });

  it("falls back safely without overwriting malformed or unreadable state", () => {
    const malformed = memoryStorage("not json");
    const unreadable = {
      getItem: () => {
        throw new Error("Storage unavailable");
      },
      setItem: () => {
        throw new Error("Must not overwrite unreadable state");
      },
    };

    expect(readApologyStageIndex("project-1", malformed)).toBe(0);
    expect(writeApologyStageIndex("project-1", 2, malformed)).toBe(false);
    expect(readApologyStageIndex("project-1", unreadable)).toBe(0);
    expect(writeApologyStageIndex("project-1", 2, unreadable)).toBe(false);
  });
});
