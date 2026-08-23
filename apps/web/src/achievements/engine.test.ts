import { describe, expect, it, vi } from "vitest";

import { ACHIEVEMENT_CATALOG } from "./catalog";
import { createAchievementEngine } from "./engine";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
    value: () => value,
  };
}

describe("achievement engine", () => {
  it("persists one unlock record and ignores duplicate events", () => {
    const storage = memoryStorage();
    const now = vi.fn(() => new Date("2026-08-23T12:00:00.000Z"));
    const engine = createAchievementEngine({ storage, now });

    expect(engine.record({ type: "fork_archaeology.opened" })).toEqual([
      { id: "git_has_receipts", unlockedAt: "2026-08-23T12:00:00.000Z" },
    ]);
    expect(engine.record({ type: "fork_archaeology.opened" })).toEqual([]);
    expect(engine.getSnapshot()).toHaveLength(1);
    expect(now).toHaveBeenCalledTimes(1);
    expect(createAchievementEngine({ storage }).getSnapshot()).toEqual(engine.getSnapshot());
  });

  it("maps all required initial events through the centralized catalog", () => {
    const engine = createAchievementEngine({
      storage: memoryStorage(),
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    });
    engine.record({ type: "repository.upstream_detected" });
    engine.record({ type: "fork.created" });
    engine.record({ type: "fork_archaeology.opened" });
    engine.record({ type: "upstream_amnesia.enabled" });
    engine.record({ type: "license_changer.license_opened" });
    engine.record({ type: "license_changer.cancelled" });
    engine.record({ type: "readme_truthiness.result" });
    engine.record({ type: "parody.blame_someone_else" });

    expect(engine.getSnapshot().map((unlock) => unlock.id)).toEqual([
      "built_from_scratch",
      "fork_around_and_find_out",
      "git_has_receipts",
      "i_remember_nothing",
      "terms_and_conditions_apply",
      "legal_department_mvp",
      "technically_ambitious",
      "forty_two",
    ]);
  });

  it("unlocks reached apology stages together and resets for development", () => {
    const storage = memoryStorage();
    const engine = createAchievementEngine({ storage });
    expect(
      engine.record({ type: "apology.stage_reached", stageIndex: 5 }).map((item) => item.id),
    ).toEqual(["double_down", "fork_isnt_that_bad", "redemption_arc"]);
    engine.reset();
    expect(engine.getSnapshot()).toEqual([]);
    expect(storage.value()).toBeNull();
  });

  it("filters malformed, duplicate, unknown, and invalid-date persisted records", () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        unlocks: [
          { id: "git_has_receipts", unlockedAt: "2026-08-23T12:00:00.000Z" },
          { id: "git_has_receipts", unlockedAt: "2026-08-24T12:00:00.000Z" },
          { id: "unknown", unlockedAt: "2026-08-23T12:00:00.000Z" },
          { id: "forty_two", unlockedAt: "not-a-date" },
        ],
      }),
    );
    expect(createAchievementEngine({ storage }).getSnapshot()).toEqual([
      { id: "git_has_receipts", unlockedAt: "2026-08-23T12:00:00.000Z" },
    ]);
  });

  it("keeps source workflows non-blocking when storage fails", () => {
    const storage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
    };
    const engine = createAchievementEngine({ storage });
    expect(() => engine.record({ type: "fork_archaeology.opened" })).not.toThrow();
    expect(engine.getSnapshot()).toHaveLength(1);
    expect(() => engine.reset()).not.toThrow();
  });

  it("isolates broken subscribers and clears malformed persisted state", () => {
    const storage = memoryStorage("malformed");
    const engine = createAchievementEngine({ storage });
    engine.reset();
    expect(storage.value()).toBeNull();
    engine.subscribe(() => {
      throw new Error("broken viewer");
    });

    expect(() => engine.record({ type: "fork_archaeology.opened" })).not.toThrow();
  });

  it("keeps every definition stable and discoverable in one catalog", () => {
    expect(new Set(ACHIEVEMENT_CATALOG.map((definition) => definition.id)).size).toBe(
      ACHIEVEMENT_CATALOG.length,
    );
    expect(ACHIEVEMENT_CATALOG).toHaveLength(14);
    expect(ACHIEVEMENT_CATALOG.find((definition) => definition.id === "forty_two")).toMatchObject({
      secret: true,
      description: "You know what you did.",
    });
  });
});
