import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { DependencyPackageManager } from "@forkara/contracts";

export type ProjectPackageManager = DependencyPackageManager;

export const PROJECT_PACKAGE_MANAGER_LOCKFILES = [
  { manager: "bun", filenames: ["bun.lock", "bun.lockb"] },
  { manager: "pnpm", filenames: ["pnpm-lock.yaml"] },
  { manager: "yarn", filenames: ["yarn.lock"] },
  { manager: "npm", filenames: ["package-lock.json", "npm-shrinkwrap.json"] },
] as const satisfies ReadonlyArray<{
  readonly manager: ProjectPackageManager;
  readonly filenames: readonly string[];
}>;

export const PROJECT_PACKAGE_MANAGER_INSTALL_COMMANDS = {
  bun: "bun install",
  pnpm: "pnpm install",
  yarn: "yarn install",
  npm: "npm install",
} as const satisfies Record<ProjectPackageManager, string>;

export interface ProjectPackageManagerFileSystem {
  readonly access: typeof fs.access;
  readonly readFile: typeof fs.readFile;
}

async function pathExists(
  fileSystem: ProjectPackageManagerFileSystem,
  absolutePath: string,
): Promise<boolean> {
  try {
    await fileSystem.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function packageManagerFromMetadata(value: unknown): ProjectPackageManager | null {
  if (typeof value !== "string") return null;
  const manager = value.split("@", 1)[0];
  return manager === "bun" || manager === "pnpm" || manager === "yarn" || manager === "npm"
    ? manager
    : null;
}

export async function detectProjectPackageManager(
  packageDir: string,
  fileSystem: ProjectPackageManagerFileSystem = fs,
): Promise<ProjectPackageManager | null> {
  for (const candidate of PROJECT_PACKAGE_MANAGER_LOCKFILES) {
    for (const filename of candidate.filenames) {
      if (await pathExists(fileSystem, path.join(packageDir, filename))) {
        return candidate.manager;
      }
    }
  }

  try {
    const packageJson: unknown = JSON.parse(
      await fileSystem.readFile(path.join(packageDir, "package.json"), "utf8"),
    );
    if (typeof packageJson !== "object" || packageJson === null) return "npm";
    return (
      packageManagerFromMetadata(
        (packageJson as { readonly packageManager?: unknown }).packageManager,
      ) ?? "npm"
    );
  } catch {
    return null;
  }
}

export function commandForPackageScript(
  manager: ProjectPackageManager,
  scriptName: string,
): string {
  return manager === "yarn" ? `yarn ${scriptName}` : `${manager} run ${scriptName}`;
}
