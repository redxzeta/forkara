import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

describe("storageOriginMigration", () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("imports missing keys without overwriting current-origin state", async () => {
    globalThis.localStorage.setItem("forkara:theme", "current");
    const { importForkaraStorageSnapshot } = await import("./storageOriginMigration");

    expect(
      importForkaraStorageSnapshot({
        version: 1,
        exportedAt: "2026-07-09T00:00:00.000Z",
        entries: {
          "forkara:theme": "snapshot",
          "forkara:composer-drafts:v1": "draft",
        },
      }),
    ).toBe(true);
    expect(globalThis.localStorage.getItem("forkara:theme")).toBe("current");
    expect(globalThis.localStorage.getItem("forkara:composer-drafts:v1")).toBe("draft");
  });

  it("rejects an invalid snapshot before writing any entry", async () => {
    const { importForkaraStorageSnapshot } = await import("./storageOriginMigration");
    expect(
      importForkaraStorageSnapshot({
        version: 1,
        exportedAt: "2026-07-09T00:00:00.000Z",
        entries: {
          "forkara:theme": "dark",
          "foreign:theme": "light",
        },
      }),
    ).toBe(false);
    expect(globalThis.localStorage.getItem("forkara:theme")).toBeNull();
  });

  it("imports snapshots containing large composer drafts", async () => {
    const { importForkaraStorageSnapshot } = await import("./storageOriginMigration");
    const largeDraft = "x".repeat(2 * 1024 * 1024);

    expect(
      importForkaraStorageSnapshot({
        version: 1,
        exportedAt: "2026-07-09T00:00:00.000Z",
        entries: { "forkara:composer-drafts:v1": largeDraft },
      }),
    ).toBe(true);
    expect(globalThis.localStorage.getItem("forkara:composer-drafts:v1")).toBe(largeDraft);
  });

  it("keeps the snapshot retryable after a partial storage failure", async () => {
    const { importForkaraStorageSnapshot } = await import("./storageOriginMigration");
    let writes = 0;
    const storage = createMemoryStorage();
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      writes += 1;
      if (writes === 2) throw new Error("temporarily unavailable");
      setItem(key, value);
    };
    const snapshot = {
      version: 1 as const,
      exportedAt: "2026-07-09T00:00:00.000Z",
      entries: { "forkara:theme": "dark", "forkara:composer-drafts:v1": "draft" },
    };

    expect(importForkaraStorageSnapshot(snapshot, storage)).toBe(false);
    storage.setItem = setItem;
    expect(importForkaraStorageSnapshot(snapshot, storage)).toBe(true);
    expect(storage.getItem("forkara:composer-drafts:v1")).toBe("draft");
  });

  it("acknowledges the desktop snapshot only after a complete bootstrap import", async () => {
    const acknowledgeSnapshot = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      desktopBridge: {
        storageMigration: {
          readSnapshot: () => ({
            version: 1,
            exportedAt: "2026-07-09T00:00:00.000Z",
            entries: { "forkara:theme": "dark" },
          }),
          acknowledgeSnapshot,
        },
      },
    });

    await import("./storageOriginMigration");
    await vi.waitFor(() => expect(acknowledgeSnapshot).toHaveBeenCalledOnce());
    expect(globalThis.localStorage.getItem("forkara:theme")).toBe("dark");
  });

  it("does not acknowledge when renderer storage rejects a write", async () => {
    const acknowledgeSnapshot = vi.fn(async () => undefined);
    globalThis.localStorage = {
      ...createMemoryStorage(),
      setItem: () => {
        throw new Error("unavailable");
      },
    } as Storage;
    vi.stubGlobal("window", {
      desktopBridge: {
        storageMigration: {
          readSnapshot: () => ({
            version: 1,
            exportedAt: "2026-07-09T00:00:00.000Z",
            entries: { "forkara:theme": "dark" },
          }),
          acknowledgeSnapshot,
        },
      },
    });

    await import("./storageOriginMigration");
    expect(acknowledgeSnapshot).not.toHaveBeenCalled();
  });
});
