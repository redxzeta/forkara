import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";

import { ResetDepartmentError, type DependencyCleanupPreview } from "@forkara/contracts";
import { Effect, Layer, Schema } from "effect";

import {
  detectProjectPackageManager,
  PROJECT_PACKAGE_MANAGER_INSTALL_COMMANDS,
} from "../../projectPackageManager";
import { GitCore, type GitCoreShape } from "../../git/Services/GitCore";
import { isContainedPath } from "../../workspace/realPathContainment";
import { inspectHardResetImpact } from "../hardResetImpact";
import {
  ResetDepartmentService,
  type ResetDepartmentServiceShape,
} from "../Services/ResetDepartmentService";

export interface ResetDepartmentDependencies {
  readonly fs: Pick<typeof nodeFs, "access" | "lstat" | "readFile" | "realpath" | "rm" | "stat">;
  readonly git?: Pick<GitCoreShape, "execute" | "withMutation">;
}

const HARD_RESET_STASH_MESSAGE = "Forkara Reset Department: stash before hard reset";

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
  const inspectHardResetImpactWithGit = (cwd: string, git: Pick<GitCoreShape, "execute">) =>
    inspectHardResetImpact({
      cwd,
      fileSystem: dependencies.fs,
      executeGit: (request) => git.execute(request),
    });

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

  const inspectHardResetImpactSnapshot: ResetDepartmentServiceShape["inspectHardResetImpact"] = (
    input,
  ) => {
    const git = dependencies.git;
    if (!git) {
      return Effect.fail(
        resetError("inspection-failed", "Git inspection is unavailable on this server.", true),
      );
    }
    return inspectHardResetImpactWithGit(input.cwd, git).pipe(
      Effect.catchCause((cause) =>
        Effect.fail(
          resetError(
            "inspection-failed",
            cause.toString().trim() || "Could not inspect hard-reset impact.",
            true,
          ),
        ),
      ),
    );
  };

  const stashHardResetChanges: ResetDepartmentServiceShape["stashHardResetChanges"] = (input) => {
    const git = dependencies.git;
    if (!git) {
      return Effect.fail(
        resetError("stash-failed", "Git stash is unavailable on this server.", true),
      );
    }

    return git
      .withMutation(
        input.cwd,
        Effect.gen(function* () {
          const current = yield* inspectHardResetImpactWithGit(input.cwd, git);
          if (
            current.repositoryState !== "ready" ||
            current.repositoryIdentity === null ||
            current.head === null ||
            current.fingerprint === null ||
            current.repositoryIdentity !== input.expectedRepositoryIdentity ||
            current.head !== input.expectedHead ||
            current.fingerprint !== input.expectedFingerprint
          ) {
            return yield* resetError(
              "stale-preview",
              "Repository state changed since inspection. Refresh the hard-reset impact before continuing.",
              true,
            );
          }

          const fileGroups: ReadonlyArray<readonly string[] | null> = [
            current.stagedTracked,
            current.unstagedTracked,
            current.untracked,
            current.conflicts,
          ];
          if (fileGroups.every((files) => files !== null && files.length === 0)) {
            return { status: "nothing-to-stash" as const, snapshot: current };
          }

          yield* git.execute({
            operation: "ResetDepartment.hardResetStash.push",
            cwd: input.cwd,
            args: ["stash", "push", "--include-untracked", "-m", HARD_RESET_STASH_MESSAGE],
            timeoutMs: 30_000,
          });
          const snapshot = yield* inspectHardResetImpactWithGit(input.cwd, git);
          return { status: "stashed" as const, snapshot };
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          Schema.is(ResetDepartmentError)(cause)
            ? cause
            : resetError(
                "stash-failed",
                "Forkara could not stash the inspected changes. Refresh the impact before trying again.",
                true,
              ),
        ),
      );
  };

  return {
    previewDependencyCleanup,
    executeDependencyCleanup,
    inspectHardResetImpact: inspectHardResetImpactSnapshot,
    stashHardResetChanges,
  };
}

export const ResetDepartmentServiceLive = Layer.effect(
  ResetDepartmentService,
  Effect.gen(function* () {
    const git = yield* GitCore;
    return makeResetDepartmentService({ fs: nodeFs, git });
  }),
);
