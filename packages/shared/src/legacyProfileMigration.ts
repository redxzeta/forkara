// FILE: legacyProfileMigration.ts
// Purpose: The sole compatibility boundary for importing a stopped Synara profile into Forkara.
// Security: Never opens SQLite and refuses state with WAL/SHM, lifecycle locks, or recovery markers.

import { createHash, randomUUID } from "node:crypto";
import * as FS from "node:fs";
import * as Path from "node:path";

const LEGACY_DIRECTORY_NAME = ".synara";
const COMPLETION_FILE = ".forkara-import-v1.json";

export const legacyProfileDirectory = (homeDirectory: string): string =>
  Path.join(homeDirectory, LEGACY_DIRECTORY_NAME);

export type LegacyImportResult =
  | {
      readonly status: "no-legacy-state" | "explicit-home" | "existing-target" | "already-migrated";
    }
  | { readonly status: "migrated"; readonly source: string; readonly target: string }
  | { readonly status: "refused-active" | "refused-recovery" | "failed"; readonly message: string };

function hasPath(path: string): boolean {
  return FS.existsSync(path);
}

function listSafeFiles(root: string, relative = ""): string[] {
  const directory = Path.join(root, relative);
  const entries = FS.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return entries.flatMap((entry) => {
    const entryRelative = Path.join(relative, entry.name);
    const fullPath = Path.join(root, entryRelative);
    if (entry.isSymbolicLink()) throw new Error(`legacy import refuses symbolic link: ${fullPath}`);
    if (entry.isDirectory()) return listSafeFiles(root, entryRelative);
    if (entry.isFile()) return [entryRelative];
    throw new Error(`legacy import refuses special file: ${fullPath}`);
  });
}

function fingerprint(root: string): string {
  const hash = createHash("sha256");
  for (const relativePath of listSafeFiles(root)) {
    const content = FS.readFileSync(Path.join(root, relativePath));
    hash.update(relativePath);
    hash.update("\0");
    hash.update(String(content.byteLength));
    hash.update("\0");
    hash.update(content);
  }
  return hash.digest("hex");
}

function legacyStateSafetyFailure(legacyHome: string): LegacyImportResult | null {
  const stateDir = Path.join(legacyHome, "userdata");
  const databasePath = Path.join(stateDir, "state.sqlite");
  const activePaths = [
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}.lifecycle-lock`,
  ];
  if (activePaths.some(hasPath)) {
    return {
      status: "refused-active",
      message:
        "Forkara did not import the legacy profile because its SQLite state appears active. Stop every legacy app and retry; the original data was left untouched.",
    };
  }
  // Electron profiles use SQLite too. A singleton lock or any live SQLite sidecar
  // means this compatibility importer cannot establish a stable snapshot.
  try {
    const legacyFiles = listSafeFiles(legacyHome);
    if (
      legacyFiles.some(
        (relativePath) =>
          /(^|[\\/])Singleton(?:Lock|Socket|Cookie)$/i.test(relativePath) ||
          /-(?:wal|shm)$/i.test(relativePath),
      )
    ) {
      return {
        status: "refused-active",
        message:
          "Forkara did not import the legacy profile because it appears active. Stop every legacy app and retry; the original data was left untouched.",
      };
    }
  } catch {
    // The normal copy path turns unsafe filesystem entries into a clear recovery error.
  }
  if (
    hasPath(stateDir) &&
    FS.readdirSync(stateDir).some((name) => /migration|recovery/i.test(name))
  ) {
    return {
      status: "refused-recovery",
      message:
        "Forkara did not import the legacy profile because it needs SQLite recovery. Complete recovery in the legacy app first; the original data was left untouched.",
    };
  }
  return null;
}

/**
 * First-launch, copy-only migration. The target is atomically promoted only after a complete
 * byte-for-byte manifest comparison. The legacy directory is never modified or removed.
 */
export function migrateLegacyProfile(input: {
  readonly homeDirectory: string;
  readonly targetDirectory: string;
  readonly hasExplicitForkaraHome: boolean;
  readonly legacyDirectory?: string;
}): LegacyImportResult {
  if (input.hasExplicitForkaraHome) return { status: "explicit-home" };
  const target = Path.resolve(input.targetDirectory);
  if (hasPath(target)) {
    return hasPath(Path.join(target, COMPLETION_FILE))
      ? { status: "already-migrated" }
      : { status: "existing-target" };
  }
  const legacy = Path.resolve(input.legacyDirectory ?? legacyProfileDirectory(input.homeDirectory));
  if (!hasPath(legacy)) return { status: "no-legacy-state" };
  const safetyFailure = legacyStateSafetyFailure(legacy);
  if (safetyFailure) return safetyFailure;

  const staging = `${target}.importing-${process.pid}-${randomUUID()}`;
  try {
    const sourceFingerprint = fingerprint(legacy);
    FS.mkdirSync(staging, { recursive: false, mode: 0o700 });
    for (const relativePath of listSafeFiles(legacy)) {
      const sourcePath = Path.join(legacy, relativePath);
      const destinationPath = Path.join(staging, relativePath);
      FS.mkdirSync(Path.dirname(destinationPath), { recursive: true, mode: 0o700 });
      FS.copyFileSync(sourcePath, destinationPath, FS.constants.COPYFILE_EXCL);
    }
    if (fingerprint(staging) !== sourceFingerprint)
      throw new Error("copied state verification failed");
    FS.writeFileSync(
      Path.join(staging, COMPLETION_FILE),
      `${JSON.stringify({ version: 1, source: legacy, completedAt: new Date().toISOString(), fingerprint: sourceFingerprint })}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    FS.renameSync(staging, target);
    return { status: "migrated", source: legacy, target };
  } catch (error) {
    FS.rmSync(staging, { recursive: true, force: true });
    return {
      status: "failed",
      message: `Forkara could not safely import legacy data: ${error instanceof Error ? error.message : "unknown error"}. The original data was left untouched; remove any empty Forkara target before retrying.`,
    };
  }
}
