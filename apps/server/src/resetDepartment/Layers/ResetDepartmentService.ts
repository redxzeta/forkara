import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";

import { ResetDepartmentError, type DependencyCleanupPreview } from "@forkara/contracts";
import { Effect, Layer, Schema } from "effect";

import {
  detectProjectPackageManager,
  PROJECT_PACKAGE_MANAGER_INSTALL_COMMANDS,
} from "../../projectPackageManager";
import { isContainedPath } from "../../workspace/realPathContainment";
import {
  ResetDepartmentService,
  type ResetDepartmentServiceShape,
} from "../Services/ResetDepartmentService";

export interface ResetDepartmentDependencies {
  readonly fs: Pick<typeof nodeFs, "access" | "lstat" | "readFile" | "realpath" | "rm" | "stat">;
}

function isMissing(cause: unknown): boolean {
  return (cause as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function resetError(
  reason: ResetDepartmentError["reason"],
  message: string,
  retryable: boolean,
): ResetDepartmentError {
  return new ResetDepartmentError({ reason, message, retryable });
}

export function makeResetDepartmentService(
  dependencies: ResetDepartmentDependencies,
): ResetDepartmentServiceShape {
  const inspect = async (cwd: string): Promise<DependencyCleanupPreview> => {
    let workspaceRoot: string;
    try {
      workspaceRoot = await dependencies.fs.realpath(cwd);
      const rootStat = await dependencies.fs.stat(workspaceRoot);
      if (!rootStat.isDirectory()) throw new Error("Workspace root is not a directory.");
    } catch (cause) {
      throw resetError(
        "workspace-unavailable",
        cause instanceof Error ? cause.message : "The active workspace is unavailable.",
        true,
      );
    }

    const targetPath = nodePath.join(workspaceRoot, "node_modules");
    if (
      !isContainedPath(workspaceRoot, targetPath) ||
      nodePath.dirname(targetPath) !== workspaceRoot
    ) {
      throw resetError("unsafe-target", "Dependency cleanup target escaped the workspace.", false);
    }

    const packageManager = await detectProjectPackageManager(workspaceRoot, dependencies.fs);
    const installCommand =
      packageManager === null ? null : PROJECT_PACKAGE_MANAGER_INSTALL_COMMANDS[packageManager];
    let targetStat: Awaited<ReturnType<typeof nodeFs.lstat>>;
    try {
      targetStat = await dependencies.fs.lstat(targetPath);
    } catch (cause) {
      if (isMissing(cause)) {
        return {
          workspaceRoot,
          targetPath,
          state: "missing",
          packageManager,
          installCommand,
        };
      }
      throw cause;
    }

    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw resetError(
        "unsafe-target",
        "Dependency cleanup refuses a node_modules symlink or non-directory target.",
        false,
      );
    }
    const realTarget = await dependencies.fs.realpath(targetPath);
    if (realTarget !== targetPath || !isContainedPath(workspaceRoot, realTarget)) {
      throw resetError(
        "unsafe-target",
        "Dependency cleanup target did not resolve to the workspace node_modules directory.",
        false,
      );
    }

    return {
      workspaceRoot,
      targetPath,
      state: "ready",
      packageManager,
      installCommand,
    };
  };

  const previewDependencyCleanup: ResetDepartmentServiceShape["previewDependencyCleanup"] = (
    input,
  ) =>
    Effect.tryPromise({
      try: () => inspect(input.cwd),
      catch: (cause) =>
        Schema.is(ResetDepartmentError)(cause)
          ? cause
          : resetError(
              "workspace-unavailable",
              cause instanceof Error ? cause.message : "Could not inspect dependencies.",
              true,
            ),
    });

  const executeDependencyCleanup: ResetDepartmentServiceShape["executeDependencyCleanup"] = (
    input,
  ) =>
    Effect.tryPromise({
      try: async () => {
        const preview = await inspect(input.cwd);
        if (preview.state === "missing") return { ...preview, removed: false };
        try {
          await dependencies.fs.rm(preview.targetPath, { recursive: true, force: false });
        } catch (cause) {
          throw resetError(
            "cleanup-failed",
            cause instanceof Error ? cause.message : "Dependency cleanup failed.",
            true,
          );
        }
        return { ...preview, state: "missing" as const, removed: true };
      },
      catch: (cause) =>
        Schema.is(ResetDepartmentError)(cause)
          ? cause
          : resetError(
              "cleanup-failed",
              cause instanceof Error ? cause.message : "Dependency cleanup failed.",
              true,
            ),
    });

  return { previewDependencyCleanup, executeDependencyCleanup };
}

export const ResetDepartmentServiceLive = Layer.succeed(
  ResetDepartmentService,
  makeResetDepartmentService({ fs: nodeFs }),
);
