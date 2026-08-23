// FILE: gitAttributionGuardian.ts
// Purpose: Read-only comparison of common attribution files between HEAD and cached upstream.
// Layer: Server Git domain helper, executed exclusively through GitCore's command seam.

import type {
  GitAttributionGuardianChange,
  GitAttributionGuardianFile,
  GitAttributionGuardianResult,
  GitUpstreamStatusResult,
} from "@forkara/contracts";
import { Effect } from "effect";

import { GitCommandError } from "./Errors.ts";

const UPSTREAM_REMOTE_NAME = "upstream";
const MAX_DIFF_CHARACTERS = 64_000;
const ATTRIBUTION_BASENAME = /^(?:license|licence|copying|copyright|notice)(?:[._-].+)?$/i;

interface ExecuteOptions {
  readonly allowNonZeroExit?: boolean;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly outputMode?: "error" | "truncate";
}

type Execute = (
  operation: string,
  cwd: string,
  args: readonly string[],
  options?: ExecuteOptions,
) => Effect.Effect<{ code: number; stdout: string; stderr: string }, GitCommandError>;

function guardianError(cwd: string, operation: string, detail: string) {
  return new GitCommandError({
    operation,
    command: "git attribution-guardian",
    cwd,
    detail,
  });
}

export function isRecognizedAttributionPath(path: string): boolean {
  const basename = path.split("/").at(-1);
  return Boolean(basename && ATTRIBUTION_BASENAME.test(basename));
}

function parsePaths(stdout: string): string[] {
  return stdout
    .split("\0")
    .filter(Boolean)
    .filter(isRecognizedAttributionPath)
    .toSorted((left, right) => left.localeCompare(right));
}

function describeChange(change: GitAttributionGuardianChange): string {
  switch (change) {
    case "added":
      return "Present only in the fork. This is informational.";
    case "deleted":
      return "Removed relative to cached upstream. Review whether its attribution must be preserved.";
    case "modified":
      return "Text differs from cached upstream. Review the patch and any applicable obligations.";
    case "unchanged":
      return "Matches the cached upstream version.";
  }
}

function unavailableResult(
  state: "missing_upstream" | "incomplete_history",
  message: string,
  upstreamRef: string | null,
): GitAttributionGuardianResult {
  return {
    state,
    message,
    localRef: "HEAD",
    upstreamRef,
    warningCount: 0,
    files: [],
  };
}

export function makeGitAttributionGuardian(input: {
  readonly execute: Execute;
  readonly upstreamStatus: (cwd: string) => Effect.Effect<GitUpstreamStatusResult, GitCommandError>;
}) {
  const { execute, upstreamStatus } = input;

  const readWithUpstream = (
    cwd: string,
    upstream: GitUpstreamStatusResult,
  ): Effect.Effect<GitAttributionGuardianResult, GitCommandError> =>
    Effect.gen(function* () {
      if (!upstream.hasUpstream || !upstream.upstreamBranch) {
        return unavailableResult(
          "missing_upstream",
          "Configure and refresh an upstream remote before comparing attribution files.",
          null,
        );
      }

      const upstreamRef = `refs/remotes/${UPSTREAM_REMOTE_NAME}/${upstream.upstreamBranch}`;
      const [upstreamRefResult, localHead] = yield* Effect.all(
        [
          execute(
            "GitCore.attributionGuardian.upstreamRef",
            cwd,
            ["show-ref", "--verify", "--quiet", upstreamRef],
            { allowNonZeroExit: true, timeoutMs: 5_000 },
          ),
          execute("GitCore.attributionGuardian.localHead", cwd, ["rev-parse", "--verify", "HEAD"], {
            allowNonZeroExit: true,
            timeoutMs: 5_000,
          }),
        ],
        { concurrency: 2 },
      );
      if (upstreamRefResult.code !== 0 || localHead.code !== 0) {
        return unavailableResult(
          "incomplete_history",
          "The local HEAD or cached upstream branch is unavailable. Refresh upstream history and try again.",
          upstreamRef,
        );
      }

      const [localTree, upstreamTree] = yield* Effect.all(
        [
          execute(
            "GitCore.attributionGuardian.localFiles",
            cwd,
            ["ls-tree", "-r", "-z", "--name-only", "HEAD"],
            { timeoutMs: 15_000, maxOutputBytes: 8 * 1_024 * 1_024 },
          ),
          execute(
            "GitCore.attributionGuardian.upstreamFiles",
            cwd,
            ["ls-tree", "-r", "-z", "--name-only", upstreamRef],
            { timeoutMs: 15_000, maxOutputBytes: 8 * 1_024 * 1_024 },
          ),
        ],
        { concurrency: 2 },
      );
      const localPaths = new Set(parsePaths(localTree.stdout));
      const upstreamPaths = new Set(parsePaths(upstreamTree.stdout));
      const paths = [...new Set([...localPaths, ...upstreamPaths])].toSorted((left, right) =>
        left.localeCompare(right),
      );

      const files = yield* Effect.forEach(
        paths,
        (path): Effect.Effect<GitAttributionGuardianFile, GitCommandError> =>
          Effect.gen(function* () {
            let change: GitAttributionGuardianChange;
            if (!upstreamPaths.has(path)) change = "added";
            else if (!localPaths.has(path)) change = "deleted";
            else {
              const comparison = yield* execute(
                "GitCore.attributionGuardian.compare",
                cwd,
                ["diff", "--quiet", "--no-ext-diff", upstreamRef, "HEAD", "--", path],
                { allowNonZeroExit: true, timeoutMs: 5_000 },
              );
              if (comparison.code > 1) {
                return yield* guardianError(
                  cwd,
                  "GitCore.attributionGuardian.compare",
                  comparison.stderr.trim() || `Unable to compare ${path}.`,
                );
              }
              change = comparison.code === 0 ? "unchanged" : "modified";
            }

            const patch =
              change === "unchanged"
                ? null
                : yield* execute(
                    "GitCore.attributionGuardian.diff",
                    cwd,
                    [
                      "diff",
                      "--no-ext-diff",
                      "--no-renames",
                      "--no-color",
                      "--unified=3",
                      upstreamRef,
                      "HEAD",
                      "--",
                      path,
                    ],
                    {
                      timeoutMs: 10_000,
                      maxOutputBytes: 512 * 1_024,
                      outputMode: "truncate",
                    },
                  );
            const diff = patch?.stdout ?? null;
            return {
              path,
              change,
              warning: change === "deleted" || change === "modified",
              summary: describeChange(change),
              diff: diff === null ? null : diff.slice(0, MAX_DIFF_CHARACTERS),
              diffTruncated: diff !== null && diff.length > MAX_DIFF_CHARACTERS,
            };
          }),
        { concurrency: 6 },
      );
      const warningCount = files.filter((file) => file.warning).length;
      const message =
        warningCount > 0
          ? `${warningCount} attribution file ${warningCount === 1 ? "change needs" : "changes need"} review. This is informational, not legal advice.`
          : files.length > 0
            ? "No removed or modified attribution files were found relative to cached upstream."
            : "No recognized license, notice, copying, or copyright files exist in either ref.";
      return {
        state: "ready",
        message,
        localRef: "HEAD",
        upstreamRef,
        warningCount,
        files,
      };
    });

  const read = (cwd: string) =>
    Effect.flatMap(upstreamStatus(cwd), (upstream) => readWithUpstream(cwd, upstream));

  return { read, readWithUpstream } as const;
}
