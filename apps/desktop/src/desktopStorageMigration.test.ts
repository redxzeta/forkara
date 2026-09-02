import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import { describe, expect, it } from "vitest";

import {
  acknowledgeForkaraStorageSnapshot,
  readForkaraStorageSnapshot,
  saveForkaraStorageSnapshot,
  FORKARA_STORAGE_SNAPSHOT_MAX_BYTES,
  validateForkaraStorageSnapshot,
} from "./desktopStorageMigration";

const snapshot = (exportedAt = "2026-07-09T00:00:00.000Z") => ({
  version: 1 as const,
  exportedAt,
  entries: {
    "forkara:theme": "dark",
    "forkara.openUsage.enabled": "true",
  },
});

describe("desktopStorageMigration", () => {
  it("round-trips atomically and acknowledges the snapshot", async () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "forkara-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      await expect(saveForkaraStorageSnapshot(target, snapshot())).resolves.toBe(true);
      expect(readForkaraStorageSnapshot(target)).toEqual(snapshot());
      expect(FS.readdirSync(directory)).toEqual(["snapshot.json"]);

      await acknowledgeForkaraStorageSnapshot(target);
      expect(readForkaraStorageSnapshot(target)).toBeNull();
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed, disallowed, and oversized snapshots", () => {
    expect(validateForkaraStorageSnapshot({ version: 1 })).toBeNull();
    expect(
      validateForkaraStorageSnapshot({
        ...snapshot(),
        entries: { "foreign:theme": "dark" },
      }),
    ).toBeNull();
    expect(
      validateForkaraStorageSnapshot({
        ...snapshot(),
        entries: { "forkara:large": "x".repeat(FORKARA_STORAGE_SNAPSHOT_MAX_BYTES) },
      }),
    ).toBeNull();
  });

  it("accepts renderer snapshots containing large composer drafts", () => {
    const largeDraft = "x".repeat(2 * 1024 * 1024);

    expect(
      validateForkaraStorageSnapshot({
        ...snapshot(),
        entries: { "forkara:composer-drafts:v1": largeDraft },
      })?.entries["forkara:composer-drafts:v1"],
    ).toBe(largeDraft);
  });

  it("does not replace a newer snapshot with an older export", async () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "forkara-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      await saveForkaraStorageSnapshot(target, snapshot("2026-07-09T01:00:00.000Z"));
      await expect(
        saveForkaraStorageSnapshot(target, snapshot("2026-07-09T00:00:00.000Z")),
      ).resolves.toBe(false);
      expect(readForkaraStorageSnapshot(target)?.exportedAt).toBe("2026-07-09T01:00:00.000Z");
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("treats missing and malformed files as absent", () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "forkara-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      expect(readForkaraStorageSnapshot(target)).toBeNull();
      FS.writeFileSync(target, "not json");
      expect(readForkaraStorageSnapshot(target)).toBeNull();
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });
});
