import { createHash } from "node:crypto";
import * as nodePath from "node:path";

import type { HardResetImpactSnapshot, HardResetOperationState } from "@forkara/contracts";
import { Effect } from "effect";

import type { GitCommandError } from "../git/Errors";
import type { ExecuteGitResult } from "../git/Services/GitCore";

interface ImpactFileSystem {
  readonly access: (path: string) => Promise<void>;
  readonly realpath: (path: string) => Promise<string>;
}

type ExecuteGit = (input: {
  readonly operation: string;
  readonly cwd: string;
  readonly args: ReadonlyArray<string>;
  readonly allowNonZeroExit?: boolean;
  readonly timeoutMs?: number;
}) => Effect.Effect<ExecuteGitResult, GitCommandError>;

interface ParsedImpactStatus {
  readonly stagedTracked: readonly string[];
  readonly unstagedTracked: readonly string[];
  readonly untracked: readonly string[];
  readonly conflicts: readonly string[];
}

function pathAfterFields(record: string, fieldCount: number): string | null {
  let offset = 0;
  for (let field = 0; field < fieldCount; field += 1) {
    offset = record.indexOf(" ", offset);
    if (offset < 0) return null;
    offset += 1;
  }
  const path = record.slice(offset);
  return path.length > 0 ? path : null;
}

export function parseHardResetImpactStatus(stdout: string): ParsedImpactStatus {
  const staged = new Set<string>();
  const unstaged = new Set<string>();
  const untracked = new Set<string>();
  const conflicts = new Set<string>();
  const records = stdout.split("\0");

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.startsWith("? ")) {
      const path = record.slice(2);
      if (path) untracked.add(path);
      continue;
    }
    if (record.startsWith("u ")) {
      const path = pathAfterFields(record, 10);
      if (path) conflicts.add(path);
      continue;
    }
    if (!record.startsWith("1 ") && !record.startsWith("2 ")) continue;

    const path = pathAfterFields(record, record.startsWith("1 ") ? 8 : 9);
    const status = record.slice(2, 4);
    if (path && status[0] !== ".") staged.add(path);
    if (path && status[1] !== ".") unstaged.add(path);
    if (record.startsWith("2 ")) index += 1;
  }

  return {
    stagedTracked: [...staged].toSorted(),
    unstagedTracked: [...unstaged].toSorted(),
    untracked: [...untracked].toSorted(),
    conflicts: [...conflicts].toSorted(),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(
  input: Omit<HardResetImpactSnapshot, "fingerprint">,
  trackedContentState: { readonly unstagedDiff: string; readonly stagedDiff: string },
): string {
  return sha256(
    JSON.stringify({
      repositoryIdentity: input.repositoryIdentity,
      repositoryRoot: input.repositoryRoot,
      branch: input.branch,
      detached: input.detached,
      head: input.head,
      stagedTracked: input.stagedTracked,
      unstagedTracked: input.unstagedTracked,
      untracked: input.untracked,
      conflicts: input.conflicts,
      operationState: input.operationState,
      unstagedDiff: trackedContentState.unstagedDiff,
      stagedDiff: trackedContentState.stagedDiff,
    }),
  );
}

function isMissing(cause: unknown): boolean {
  return (cause as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

async function operationState(
  fileSystem: ImpactFileSystem,
  gitDirectory: string,
): Promise<HardResetOperationState> {
  const exists = async (path: string): Promise<boolean | null> => {
    try {
      await fileSystem.access(path);
      return true;
    } catch (cause) {
      return isMissing(cause) ? false : null;
    }
  };
  const [merge, rebaseMerge, rebaseApply] = await Promise.all([
    exists(nodePath.join(gitDirectory, "MERGE_HEAD")),
    exists(nodePath.join(gitDirectory, "rebase-merge")),
    exists(nodePath.join(gitDirectory, "rebase-apply")),
  ]);
  if (merge === true) return "merge";
  if (rebaseMerge === true || rebaseApply === true) return "rebase";
  return merge === null || rebaseMerge === null || rebaseApply === null ? "unknown" : "none";
}

export function inspectHardResetImpact(input: {
  readonly cwd: string;
  readonly fileSystem: ImpactFileSystem;
  readonly executeGit: ExecuteGit;
}): Effect.Effect<HardResetImpactSnapshot, GitCommandError> {
  const execute = (operation: string, args: readonly string[], allowNonZeroExit = false) =>
    input.executeGit({
      operation: `ResetDepartment.hardResetImpact.${operation}`,
      cwd: input.cwd,
      args,
      allowNonZeroExit,
      timeoutMs: 10_000,
    });

  return Effect.gen(function* () {
    const workspaceRoot = yield* Effect.promise(() => input.fileSystem.realpath(input.cwd));
    const inside = yield* execute("insideWorktree", ["rev-parse", "--is-inside-work-tree"], true);
    if (inside.code !== 0 || inside.stdout.trim() !== "true") {
      return {
        repositoryState: "not-repository",
        workspaceRoot,
        repositoryRoot: null,
        repositoryIdentity: null,
        branch: null,
        detached: null,
        head: null,
        stagedTracked: null,
        unstagedTracked: null,
        untracked: null,
        conflicts: null,
        operationState: "unknown",
        fingerprint: null,
      };
    }

    const [
      rootResult,
      commonDirResult,
      gitDirResult,
      headResult,
      branchResult,
      statusResult,
      unstagedDiffResult,
      stagedDiffResult,
    ] = yield* Effect.all(
      [
        execute("root", ["rev-parse", "--show-toplevel"]),
        execute("commonDir", ["rev-parse", "--git-common-dir"]),
        execute("gitDir", ["rev-parse", "--absolute-git-dir"]),
        execute("head", ["rev-parse", "--verify", "HEAD"], true),
        execute("branch", ["symbolic-ref", "--short", "-q", "HEAD"], true),
        execute("status", ["status", "--porcelain=v2", "-z", "--untracked-files=all"]),
        execute("unstagedDiff", ["diff", "--no-ext-diff", "--no-textconv", "--binary", "--"]),
        execute("stagedDiff", [
          "diff",
          "--cached",
          "--no-ext-diff",
          "--no-textconv",
          "--binary",
          "--",
        ]),
      ],
      { concurrency: 8 },
    );

    const repositoryRoot = yield* Effect.promise(() =>
      input.fileSystem.realpath(rootResult.stdout.trim()),
    );
    const rawCommonDir = commonDirResult.stdout.trim();
    const commonDir = yield* Effect.promise(() =>
      input.fileSystem.realpath(
        nodePath.isAbsolute(rawCommonDir)
          ? rawCommonDir
          : nodePath.resolve(workspaceRoot, rawCommonDir),
      ),
    );
    const rawGitDir = gitDirResult.stdout.trim();
    const gitDirectory = yield* Effect.promise(() =>
      input.fileSystem.realpath(
        nodePath.isAbsolute(rawGitDir) ? rawGitDir : nodePath.resolve(workspaceRoot, rawGitDir),
      ),
    );
    const status = parseHardResetImpactStatus(statusResult.stdout);
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() || null : null;
    const detached = branchResult.code === 0 ? false : branchResult.code === 1 ? true : null;
    const head = headResult.code === 0 ? headResult.stdout.trim() || null : null;
    const state = yield* Effect.promise(() => operationState(input.fileSystem, gitDirectory));
    const repositoryIdentity = sha256(`${repositoryRoot}\0${commonDir}`);
    const snapshotWithoutFingerprint = {
      repositoryState: "ready" as const,
      workspaceRoot,
      repositoryRoot,
      repositoryIdentity,
      branch,
      detached,
      head,
      stagedTracked: [...status.stagedTracked],
      unstagedTracked: [...status.unstagedTracked],
      untracked: [...status.untracked],
      conflicts: [...status.conflicts],
      operationState: state,
    };
    return {
      ...snapshotWithoutFingerprint,
      fingerprint: fingerprint(snapshotWithoutFingerprint, {
        unstagedDiff: unstagedDiffResult.stdout,
        stagedDiff: stagedDiffResult.stdout,
      }),
    };
  });
}
