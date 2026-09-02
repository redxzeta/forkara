import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { migrateLegacyProfile } from "./legacyProfileMigration";

const temporaryDirectories: string[] = [];
const makeDirectory = (): string => {
  const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "forkara-identity-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    FS.rmSync(directory, { recursive: true, force: true });
  }
});

function migrationInput(root: string) {
  return {
    homeDirectory: root,
    targetDirectory: Path.join(root, ".forkara"),
    legacyDirectory: Path.join(root, ".synara"),
    hasExplicitForkaraHome: false,
  };
}

describe("legacy Synara profile migration", () => {
  it("does nothing when no legacy state exists or an explicit Forkara home is configured", () => {
    const root = makeDirectory();
    expect(migrateLegacyProfile(migrationInput(root))).toEqual({ status: "no-legacy-state" });
    FS.mkdirSync(Path.join(root, ".synara"));
    expect(migrateLegacyProfile({ ...migrationInput(root), hasExplicitForkaraHome: true })).toEqual(
      {
        status: "explicit-home",
      },
    );
  });

  it("copies, verifies, atomically promotes, and preserves the legacy source", () => {
    const root = makeDirectory();
    const input = migrationInput(root);
    FS.mkdirSync(Path.join(input.legacyDirectory, "userdata"), { recursive: true });
    FS.writeFileSync(Path.join(input.legacyDirectory, "userdata", "state.sqlite"), "database");
    FS.writeFileSync(Path.join(input.legacyDirectory, "workspace.json"), "{}\n");

    expect(migrateLegacyProfile(input)).toMatchObject({ status: "migrated" });
    expect(
      FS.readFileSync(Path.join(input.targetDirectory, "userdata", "state.sqlite"), "utf8"),
    ).toBe("database");
    expect(
      FS.readFileSync(Path.join(input.legacyDirectory, "userdata", "state.sqlite"), "utf8"),
    ).toBe("database");
    expect(migrateLegacyProfile(input)).toEqual({ status: "already-migrated" });
  });

  it("never copies a live SQLite/WAL profile or one waiting for recovery", () => {
    const root = makeDirectory();
    const input = migrationInput(root);
    FS.mkdirSync(Path.join(input.legacyDirectory, "userdata"), { recursive: true });
    FS.writeFileSync(Path.join(input.legacyDirectory, "userdata", "state.sqlite-wal"), "live");
    expect(migrateLegacyProfile(input)).toMatchObject({ status: "refused-active" });
    expect(FS.existsSync(input.targetDirectory)).toBe(false);

    FS.rmSync(Path.join(input.legacyDirectory, "userdata", "state.sqlite-wal"));
    FS.writeFileSync(Path.join(input.legacyDirectory, "userdata", "migration-recovery.json"), "{}");
    expect(migrateLegacyProfile(input)).toMatchObject({ status: "refused-recovery" });
    expect(FS.existsSync(input.targetDirectory)).toBe(false);
  });

  it("leaves an existing target alone and cleans an interrupted staging attempt", () => {
    const root = makeDirectory();
    const input = migrationInput(root);
    FS.mkdirSync(input.targetDirectory);
    expect(migrateLegacyProfile(input)).toEqual({ status: "existing-target" });

    FS.rmSync(input.targetDirectory, { recursive: true, force: true });
    FS.mkdirSync(input.legacyDirectory);
    FS.symlinkSync("outside", Path.join(input.legacyDirectory, "unsafe"));
    expect(migrateLegacyProfile(input)).toMatchObject({ status: "failed" });
    expect(FS.readdirSync(root).filter((name) => name.includes(".importing-")).length).toBe(0);
  });
});
