// FILE: gitForkHealth.ts
// Purpose: Deterministic fork health derived from cached upstream data and local Git facts.
// Layer: Server Git domain helper, executed exclusively through GitCore's command seam.

import type {
  GitForkHealthAttributionState,
  GitForkHealthResult,
  GitForkHealthState,
  GitUpstreamStatusResult,
} from "@forkara/contracts";
import { Effect } from "effect";

import type { GitCommandError } from "./Errors.ts";
import { readGitWorktreeSafety } from "./gitWorktreeSafety.ts";

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

interface ForkHealthFacts {
  readonly upstream: GitUpstreamStatusResult;
  readonly hasWorkingTreeChanges: boolean;
  readonly unresolvedConflictFiles: ReadonlyArray<string>;
  readonly attribution: {
    readonly state: GitForkHealthAttributionState;
    readonly message: string;
  };
}

const STATE_LABELS: Readonly<Record<GitForkHealthState, string>> = {
  healthy: "Healthy",
  needs_sync: "Needs sync",
  diverged: "Diverged",
  upstream_unavailable: "Upstream unavailable",
  conflicts: "Conflicts",
  local_changes: "Local changes",
  attribution_warning: "Attribution warning",
  unknown: "Unknown",
};

function deriveState(facts: ForkHealthFacts): GitForkHealthState {
  if (facts.unresolvedConflictFiles.length > 0) return "conflicts";
  if (facts.upstream.state === "missing" || facts.upstream.state === "unreachable") {
    return "upstream_unavailable";
  }
  if (facts.upstream.state === "stale" || facts.upstream.lastSuccessfulFetchAt === null) {
    return "unknown";
  }
  if (facts.upstream.aheadCount > 0 && facts.upstream.behindCount > 0) return "diverged";
  if (facts.upstream.behindCount > 0) return "needs_sync";
  if (facts.attribution.state === "warning") return "attribution_warning";
  if (facts.hasWorkingTreeChanges) return "local_changes";
  return "healthy";
}

function stateSummary(state: GitForkHealthState): string {
  switch (state) {
    case "healthy":
      return "The fork has no known sync or working-tree problems.";
    case "needs_sync":
      return "The fork can receive upstream commits without reconciling divergent history.";
    case "diverged":
      return "The fork and upstream both contain commits the other side does not have.";
    case "upstream_unavailable":
      return "Forkara cannot currently confirm the upstream relationship.";
    case "conflicts":
      return "The working tree contains unresolved Git conflicts.";
    case "local_changes":
      return "The upstream relationship is current, but the working tree has local changes.";
    case "attribution_warning":
      return "Attribution Guardian reported a license or notice concern.";
    case "unknown":
      return "Cached upstream information is not fresh enough to assign a health state.";
  }
}

function upstreamReason(upstream: GitUpstreamStatusResult): string {
  if (upstream.state === "missing") return "No upstream remote is configured.";
  if (upstream.state === "unreachable") {
    return upstream.lastSuccessfulFetchAt
      ? "The last upstream refresh failed; cached divergence may be outdated."
      : "Upstream could not be reached and has never been fetched successfully.";
  }
  if (upstream.state === "stale" || upstream.lastSuccessfulFetchAt === null) {
    return "The cached upstream relationship needs an explicit refresh.";
  }
  if (upstream.aheadCount > 0 && upstream.behindCount > 0) {
    return `The fork is ${upstream.aheadCount} ahead and ${upstream.behindCount} behind upstream.`;
  }
  if (upstream.behindCount > 0) {
    return `The fork is ${upstream.behindCount} commit${upstream.behindCount === 1 ? "" : "s"} behind upstream.`;
  }
  if (upstream.aheadCount > 0) {
    return `The fork is ${upstream.aheadCount} commit${upstream.aheadCount === 1 ? "" : "s"} ahead and not behind upstream.`;
  }
  return "The fork is up to date with upstream.";
}

export function deriveForkHealth(facts: ForkHealthFacts): GitForkHealthResult {
  const state = deriveState(facts);
  const reasons = [
    ...(facts.unresolvedConflictFiles.length > 0
      ? [
          `${facts.unresolvedConflictFiles.length} unresolved conflict${facts.unresolvedConflictFiles.length === 1 ? "" : "s"} detected.`,
        ]
      : []),
    upstreamReason(facts.upstream),
    facts.hasWorkingTreeChanges
      ? "The working tree has local changes."
      : "The working tree is clean.",
    facts.attribution.message,
  ];
  return {
    state,
    label: STATE_LABELS[state],
    summary: stateSummary(state),
    reasons,
    hasWorkingTreeChanges: facts.hasWorkingTreeChanges,
    unresolvedConflictFiles: facts.unresolvedConflictFiles,
    attribution: facts.attribution,
    upstream: facts.upstream,
  };
}

export function makeGitForkHealth(input: {
  readonly execute: Execute;
  readonly upstreamStatus: (cwd: string) => Effect.Effect<GitUpstreamStatusResult, GitCommandError>;
}) {
  const { execute, upstreamStatus } = input;
  const read = (cwd: string): Effect.Effect<GitForkHealthResult, GitCommandError> =>
    Effect.gen(function* () {
      const [upstream, worktree] = yield* Effect.all(
        [
          upstreamStatus(cwd),
          readGitWorktreeSafety({ execute, cwd, operationPrefix: "GitCore.forkHealth" }),
        ],
        { concurrency: 2 },
      );
      return deriveForkHealth({
        upstream,
        hasWorkingTreeChanges: worktree.hasWorkingTreeChanges,
        unresolvedConflictFiles: worktree.unresolvedConflictFiles,
        attribution: {
          state: "unknown",
          message:
            "Attribution has not been evaluated because Attribution Guardian is not available yet.",
        },
      });
    });

  return { read } as const;
}
