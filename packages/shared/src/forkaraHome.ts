// FILE: forkaraHome.ts
// Purpose: Resolves the user-level Forkara base directory without Effect, so the backend
// server and the Electron main process agree on one location during early startup.
// Exports: expandHomePath, resolveForkaraHomeDirectory, FORKARA_HOME_ENV_NAME.

import * as OS from "node:os";
import * as Path from "node:path";

import { migrateLegacyProfile } from "./legacyProfileMigration";

export const FORKARA_HOME_ENV_NAME = "FORKARA_HOME";
export const DEFAULT_FORKARA_HOME_DIRECTORY_NAME = ".forkara";

/** Expands a leading `~` against the user's home directory; other inputs pass through. */
export function expandHomePath(input: string, homeDirectory: string = OS.homedir()): string {
  if (input === "~") {
    return homeDirectory;
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return Path.join(homeDirectory, input.slice(2));
  }
  return input;
}

/**
 * Resolves the Forkara base directory the same way for every process in the install.
 *
 * Deliberately plain Node: the Electron main process needs this before Effect (or even
 * `app.whenReady()`) is available, and the login-shell environment cache has to land in
 * the same place whichever process wrote it first.
 */
export function resolveForkaraHomeDirectory(
  options: {
    /** Explicit override; falls back to `FORKARA_HOME` from `env`. */
    readonly configuredHome?: string | undefined;
    readonly env?: NodeJS.ProcessEnv;
    readonly homeDirectory?: string;
    /** Flavor-specific default (`.forkara-canary`), used only when nothing is configured. */
    readonly directoryName?: string;
  } = {},
): string {
  const homeDirectory = options.homeDirectory ?? OS.homedir();
  const configured = (
    options.configuredHome ?? (options.env ?? process.env)[FORKARA_HOME_ENV_NAME]
  )?.trim();
  if (!configured) {
    return Path.join(homeDirectory, options.directoryName ?? DEFAULT_FORKARA_HOME_DIRECTORY_NAME);
  }
  return Path.resolve(expandHomePath(configured, homeDirectory));
}

export class ForkaraHomeMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForkaraHomeMigrationError";
  }
}

/** Resolves and, only on an unconfigured first launch, imports a stopped legacy profile. */
export function prepareForkaraHomeDirectory(
  options: Parameters<typeof resolveForkaraHomeDirectory>[0] = {},
): string {
  const homeDirectory = options.homeDirectory ?? OS.homedir();
  const configuredHome =
    options.configuredHome ?? (options.env ?? process.env)[FORKARA_HOME_ENV_NAME];
  const targetDirectory = resolveForkaraHomeDirectory(options);
  const result = migrateLegacyProfile({
    homeDirectory,
    targetDirectory,
    hasExplicitForkaraHome: Boolean(configuredHome?.trim()),
  });
  if (
    result.status === "refused-active" ||
    result.status === "refused-recovery" ||
    result.status === "failed"
  ) {
    throw new ForkaraHomeMigrationError(result.message);
  }
  return targetDirectory;
}
