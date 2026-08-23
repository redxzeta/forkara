// FILE: gitUpstreamSync.ts
// Purpose: Preview and guarded application of the existing fork/upstream radar relationship.
// Layer: Server Git domain helper, executed exclusively through GitCore's command seam.

import type {
  GitApplyUpstreamSyncInput,
  GitUpstreamSyncApplyResult,
  GitUpstreamSyncCommit,
  GitUpstreamSyncPreviewResult,
  GitUpstreamSyncStrategy,
  GitUpstreamStatusResult,
} from "@forkara/contracts";
import { Effect } from "effect";

import { GitCommandError } from "./Errors.ts";

const UPSTREAM_REMOTE_NAME = "upstream";
const INCOMING_COMMIT_LIMIT = 20;

interface ExecuteOptions {
  readonly allowNonZeroExit?: boolean;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

type Execute = (
  operation: string,
  cwd: string,
  args: readonly string[],
  options?: ExecuteOptions,
) => Effect.Effect<{ code: number; stdout: string; stderr: string }, GitCommandError>;

function syncError(cwd: string, operation: string, detail: string) {
  return new GitCommandError({
    operation,
    command: "git upstream-sync",
    cwd,
    detail,
  });
}

function syncMessage(input: {
  state: GitUpstreamSyncPreviewResult["state"];
  aheadCount: number;
  behindCount: number;
  preferredStrategy: GitUpstreamSyncStrategy;
}): string {
  switch (input.state) {
    case "missing":
      return "Configure an upstream remote before syncing this fork.";
    case "unreachable":
      return "Upstream could not be fetched, so no sync can be previewed.";
    case "detached":
      return "Check out the fork's default branch before syncing.";
    case "branch_mismatch":
      return "Check out the fork's default branch before syncing it with upstream.";
    case "conflicts":
      return "Upstream changes conflict with this fork. Resolve them with the repository's normal Git workflow.";
    case "dirty":
      return "Commit or stash working tree changes before syncing upstream.";
    case "up_to_date":
      return "The fork's default branch is already up to date with upstream.";
    case "local_ahead":
      return `The fork is ${input.aheadCount} commit${input.aheadCount === 1 ? "" : "s"} ahead and has no incoming upstream commits.`;
    case "fast_forward":
      return `Ready to fast-forward by ${input.behindCount} commit${input.behindCount === 1 ? "" : "s"}. This updates only the local branch.`;
    case "diverged": {
      const convention =
        input.preferredStrategy === "unspecified"
          ? "Choose merge or rebase explicitly in your normal Git workflow."
          : input.preferredStrategy === "fast-forward-only"
            ? "This repository permits only fast-forward pulls, so resolve the divergence manually."
            : `This repository is configured to prefer ${input.preferredStrategy}. Continue in your normal Git workflow.`;
      return `The fork has diverged (${input.aheadCount} ahead, ${input.behindCount} behind). ${convention}`;
    }
  }
}

export function makeGitUpstreamSync(input: {
  readonly execute: Execute;
  readonly status: (cwd: string) => Effect.Effect<GitUpstreamStatusResult, GitCommandError>;
  readonly refresh: (cwd: string) => Effect.Effect<GitUpstreamStatusResult, GitCommandError>;
}) {
  const { execute, status, refresh } = input;

  const readConfig = (cwd: string, key: string) =>
    execute("GitCore.upstreamSync.config", cwd, ["config", "--get", key], {
      allowNonZeroExit: true,
      timeoutMs: 5_000,
    }).pipe(Effect.map((result) => (result.code === 0 ? result.stdout.trim() : "")));

  const readPreferredStrategy = (
    cwd: string,
    branch: string | null,
  ): Effect.Effect<GitUpstreamSyncStrategy, GitCommandError> =>
    Effect.gen(function* () {
      const pullFf = (yield* readConfig(cwd, "pull.ff")).toLowerCase();
      if (pullFf === "only") return "fast-forward-only";
      if (["false", "no", "off", "0"].includes(pullFf)) return "merge";
      const branchRebase = branch ? yield* readConfig(cwd, `branch.${branch}.rebase`) : "";
      const pullRebase = branchRebase || (yield* readConfig(cwd, "pull.rebase"));
      if (
        ["true", "yes", "on", "1", "merges", "interactive", "preserve"].includes(
          pullRebase.toLowerCase(),
        )
      ) {
        return "rebase";
      }
      if (["false", "no", "off", "0"].includes(pullRebase.toLowerCase())) return "merge";
      return "unspecified";
    });

  const readIncomingCommits = (
    cwd: string,
    localHead: string,
    upstreamRef: string,
  ): Effect.Effect<
    { commits: ReadonlyArray<GitUpstreamSyncCommit>; truncated: boolean },
    GitCommandError
  > =>
    execute(
      "GitCore.upstreamSync.incomingCommits",
      cwd,
      [
        "log",
        `--max-count=${INCOMING_COMMIT_LIMIT + 1}`,
        "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1e",
        `${localHead}..${upstreamRef}`,
      ],
      { timeoutMs: 10_000, maxOutputBytes: 256 * 1_024 },
    ).pipe(
      Effect.map((result) => {
        const commits = result.stdout
          .split("\x1e")
          .map((record) => record.trim())
          .filter(Boolean)
          .flatMap((record) => {
            const [sha, shortSha, subject, authorName, authoredAt] = record.split("\x1f");
            return sha && shortSha && subject && authorName && authoredAt
              ? [{ sha, shortSha, subject, authorName, authoredAt }]
              : [];
          });
        return {
          commits: commits.slice(0, INCOMING_COMMIT_LIMIT),
          truncated: commits.length > INCOMING_COMMIT_LIMIT,
        };
      }),
    );

  const readProspectiveConflictFiles = (
    cwd: string,
    localHead: string,
    upstreamRef: string,
  ): Effect.Effect<{ hasConflicts: boolean; files: ReadonlyArray<string> }, GitCommandError> =>
    Effect.gen(function* () {
      const result = yield* execute(
        "GitCore.upstreamSync.mergeTree",
        cwd,
        ["merge-tree", "--write-tree", "--name-only", "-z", localHead, upstreamRef],
        { allowNonZeroExit: true, timeoutMs: 30_000, maxOutputBytes: 256 * 1_024 },
      );
      if (result.code > 1) {
        return yield* syncError(
          cwd,
          "GitCore.upstreamSync.mergeTree",
          "Git could not inspect the prospective upstream merge.",
        );
      }
      if (result.code === 0) return { hasConflicts: false, files: [] };
      const fields = result.stdout.split("\0");
      const blank = fields.findIndex((field, index) => index > 0 && field.length === 0);
      const candidates = blank > 1 ? fields.slice(1, blank) : [];
      return {
        hasConflicts: true,
        files: [...new Set(candidates.filter((file) => file.length > 0))],
      };
    });

  const preview = (cwd: string): Effect.Effect<GitUpstreamSyncPreviewResult, GitCommandError> =>
    Effect.gen(function* () {
      const refreshed = yield* refresh(cwd);
      const preferredStrategy = yield* readPreferredStrategy(cwd, refreshed.localBranch);
      const empty = (state: GitUpstreamSyncPreviewResult["state"], message?: string) => ({
        state,
        canApply: false,
        localBranch: refreshed.localBranch,
        upstreamBranch: refreshed.upstreamBranch,
        localHead: null,
        upstreamHead: null,
        aheadCount: refreshed.aheadCount,
        behindCount: refreshed.behindCount,
        incomingCommits: [],
        incomingCommitsTruncated: false,
        conflictFiles: [],
        preferredStrategy,
        message:
          message ??
          syncMessage({
            state,
            aheadCount: refreshed.aheadCount,
            behindCount: refreshed.behindCount,
            preferredStrategy,
          }),
      });

      if (!refreshed.hasUpstream) return empty("missing");
      if (refreshed.state === "unreachable") return empty("unreachable");
      if (!refreshed.localBranch || !refreshed.upstreamBranch) {
        return empty("missing", "The local or upstream default branch could not be determined.");
      }

      const currentBranchResult = yield* execute(
        "GitCore.upstreamSync.currentBranch",
        cwd,
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        { allowNonZeroExit: true, timeoutMs: 5_000 },
      );
      const currentBranch = currentBranchResult.stdout.trim();
      if (currentBranchResult.code !== 0 || !currentBranch) return empty("detached");
      if (currentBranch !== refreshed.localBranch) return empty("branch_mismatch");

      const upstreamRef = `refs/remotes/${UPSTREAM_REMOTE_NAME}/${refreshed.upstreamBranch}`;
      const [localHeadResult, upstreamHeadResult, dirtyResult, unresolvedResult] =
        yield* Effect.all(
          [
            execute("GitCore.upstreamSync.localHead", cwd, ["rev-parse", "--verify", "HEAD"]),
            execute("GitCore.upstreamSync.upstreamHead", cwd, [
              "rev-parse",
              "--verify",
              upstreamRef,
            ]),
            execute("GitCore.upstreamSync.dirty", cwd, ["status", "--porcelain=v1", "-z"]),
            execute("GitCore.upstreamSync.unresolved", cwd, [
              "diff",
              "--name-only",
              "--diff-filter=U",
              "-z",
            ]),
          ],
          { concurrency: 4 },
        );
      const localHead = localHeadResult.stdout.trim();
      const upstreamHead = upstreamHeadResult.stdout.trim();
      const incoming = yield* readIncomingCommits(cwd, localHead, upstreamRef);
      const unresolvedFiles = unresolvedResult.stdout.split("\0").filter(Boolean);

      let state: GitUpstreamSyncPreviewResult["state"];
      let conflictFiles: ReadonlyArray<string> = unresolvedFiles;
      if (unresolvedFiles.length > 0) {
        state = "conflicts";
      } else if (dirtyResult.stdout.length > 0) {
        state = "dirty";
      } else if (refreshed.aheadCount > 0 && refreshed.behindCount > 0) {
        const conflictPreview = yield* readProspectiveConflictFiles(cwd, localHead, upstreamRef);
        conflictFiles = conflictPreview.files;
        state = conflictPreview.hasConflicts ? "conflicts" : "diverged";
      } else if (refreshed.behindCount > 0) {
        state = "fast_forward";
      } else if (refreshed.aheadCount > 0) {
        state = "local_ahead";
      } else {
        state = "up_to_date";
      }

      return {
        state,
        canApply: state === "fast_forward",
        localBranch: refreshed.localBranch,
        upstreamBranch: refreshed.upstreamBranch,
        localHead,
        upstreamHead,
        aheadCount: refreshed.aheadCount,
        behindCount: refreshed.behindCount,
        incomingCommits: incoming.commits,
        incomingCommitsTruncated: incoming.truncated,
        conflictFiles,
        preferredStrategy,
        message: syncMessage({
          state,
          aheadCount: refreshed.aheadCount,
          behindCount: refreshed.behindCount,
          preferredStrategy,
        }),
      };
    });

  const apply = (
    input: GitApplyUpstreamSyncInput,
  ): Effect.Effect<GitUpstreamSyncApplyResult, GitCommandError> =>
    Effect.gen(function* () {
      const cached = yield* status(input.cwd);
      if (!cached.localBranch || !cached.upstreamBranch) {
        return yield* syncError(
          input.cwd,
          "GitCore.upstreamSync.apply",
          "The sync preview is no longer valid. Preview upstream sync again.",
        );
      }
      const currentBranch = yield* execute(
        "GitCore.upstreamSync.apply.currentBranch",
        input.cwd,
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        { allowNonZeroExit: true, timeoutMs: 5_000 },
      );
      const branch = currentBranch.stdout.trim();
      const upstreamRef = `refs/remotes/${UPSTREAM_REMOTE_NAME}/${cached.upstreamBranch}`;
      const [localHeadResult, upstreamHeadResult, dirtyResult, unresolvedResult] =
        yield* Effect.all(
          [
            execute("GitCore.upstreamSync.apply.localHead", input.cwd, [
              "rev-parse",
              "--verify",
              "HEAD",
            ]),
            execute("GitCore.upstreamSync.apply.upstreamHead", input.cwd, [
              "rev-parse",
              "--verify",
              upstreamRef,
            ]),
            execute("GitCore.upstreamSync.apply.dirty", input.cwd, [
              "status",
              "--porcelain=v1",
              "-z",
            ]),
            execute("GitCore.upstreamSync.apply.unresolved", input.cwd, [
              "diff",
              "--name-only",
              "--diff-filter=U",
              "-z",
            ]),
          ],
          { concurrency: 4 },
        );
      const localHead = localHeadResult.stdout.trim();
      const upstreamHead = upstreamHeadResult.stdout.trim();
      const stale =
        currentBranch.code !== 0 ||
        branch !== cached.localBranch ||
        localHead !== input.expectedLocalHead ||
        upstreamHead !== input.expectedUpstreamHead;
      if (stale) {
        return yield* syncError(
          input.cwd,
          "GitCore.upstreamSync.apply",
          "Repository state changed after the preview. Preview upstream sync again.",
        );
      }
      if (dirtyResult.stdout.length > 0 || unresolvedResult.stdout.length > 0) {
        return yield* syncError(
          input.cwd,
          "GitCore.upstreamSync.apply",
          "The working tree is no longer clean. Commit or stash changes, then preview again.",
        );
      }
      const ancestor = yield* execute(
        "GitCore.upstreamSync.apply.ancestor",
        input.cwd,
        ["merge-base", "--is-ancestor", "HEAD", upstreamRef],
        { allowNonZeroExit: true, timeoutMs: 10_000 },
      );
      if (ancestor.code !== 0 || localHead === upstreamHead) {
        return yield* syncError(
          input.cwd,
          "GitCore.upstreamSync.apply",
          "Upstream is no longer a clean fast-forward. Preview upstream sync again.",
        );
      }

      yield* execute(
        "GitCore.upstreamSync.apply.fastForward",
        input.cwd,
        ["merge", "--ff-only", "--no-edit", upstreamRef],
        { timeoutMs: 60_000, maxOutputBytes: 256 * 1_024 },
      );
      const after = yield* execute("GitCore.upstreamSync.apply.afterHead", input.cwd, [
        "rev-parse",
        "--verify",
        "HEAD",
      ]);
      return {
        branch,
        beforeSha: localHead,
        afterSha: after.stdout.trim(),
        upstreamStatus: yield* status(input.cwd),
      };
    });

  return { preview, apply } as const;
}
