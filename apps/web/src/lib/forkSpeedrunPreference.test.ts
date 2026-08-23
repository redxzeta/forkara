import { describe, expect, it } from "vitest";

import { isForkSpeedrunEnabled, setForkSpeedrunEnabled } from "./forkSpeedrunPreference";

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

describe("forkSpeedrunPreference", () => {
  it("stays off until explicitly enabled and persists only project ids", () => {
    const storage = memoryStorage();

    expect(isForkSpeedrunEnabled("project-1", storage)).toBe(false);
    setForkSpeedrunEnabled("project-1", true, storage);
    expect(isForkSpeedrunEnabled("project-1", storage)).toBe(true);
    expect(storage.value()).toBe('["project-1"]');
  });

  it("disables one project without changing another and tolerates malformed state", () => {
    const storage = memoryStorage('["project-2","project-1"]');

    setForkSpeedrunEnabled("project-1", false, storage);
    expect(isForkSpeedrunEnabled("project-1", storage)).toBe(false);
    expect(isForkSpeedrunEnabled("project-2", storage)).toBe(true);
    expect(isForkSpeedrunEnabled("project-1", memoryStorage("not json"))).toBe(false);
  });

  it("reports storage failures without throwing", () => {
    const writeFailureStorage = {
      getItem: () => "[]",
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    };
    const readFailureStorage = {
      getItem: () => {
        throw new Error("Storage unavailable");
      },
      setItem: () => {
        throw new Error("Must not overwrite unreadable preferences");
      },
    };

    expect(setForkSpeedrunEnabled("project-1", true, writeFailureStorage)).toBe(false);
    expect(isForkSpeedrunEnabled("project-1", readFailureStorage)).toBe(false);
    expect(setForkSpeedrunEnabled("project-1", true, readFailureStorage)).toBe(false);
  });
});
