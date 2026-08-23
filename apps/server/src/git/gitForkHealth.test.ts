import type { GitForkHealthAttributionState, GitUpstreamStatusResult } from "@forkara/contracts";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { GitCommandError } from "./Errors.ts";
import { deriveForkHealth, makeGitForkHealth } from "./gitForkHealth.ts";

function upstream(overrides: Partial<GitUpstreamStatusResult> = {}): GitUpstreamStatusResult {
  return {
    state: "ready",
    hasUpstream: true,
    localBranch: "built-from-scratch",
    upstreamBranch: "main",
    aheadCount: 0,
    behindCount: 0,
    lastSuccessfulFetchAt: "2026-08-23T12:00:00.000Z",
    checkedAt: "2026-08-23T12:01:00.000Z",
    message: "Fork is up to date with upstream.",
    ...overrides,
  };
}

function health(input?: {
  upstream?: GitUpstreamStatusResult;
  dirty?: boolean;
  conflicts?: ReadonlyArray<string>;
  attribution?: GitForkHealthAttributionState;
}) {
  const attribution = input?.attribution ?? "unknown";
  return deriveForkHealth({
    upstream: input?.upstream ?? upstream(),
    hasWorkingTreeChanges: input?.dirty ?? false,
    unresolvedConflictFiles: input?.conflicts ?? [],
    attribution: {
      state: attribution,
      message:
        attribution === "warning"
          ? "A license or notice concern was detected."
          : attribution === "present"
            ? "Expected attribution files are present."
            : "Attribution has not been evaluated.",
    },
  });
}

describe("deriveForkHealth", () => {
  it.each([
    ["healthy", health()],
    ["needs_sync", health({ upstream: upstream({ behindCount: 2 }) })],
    ["diverged", health({ upstream: upstream({ aheadCount: 1, behindCount: 2 }) })],
    [
      "upstream_unavailable",
      health({
        upstream: upstream({
          state: "missing",
          hasUpstream: false,
          localBranch: null,
          upstreamBranch: null,
          lastSuccessfulFetchAt: null,
        }),
      }),
    ],
    ["conflicts", health({ dirty: true, conflicts: ["README.md"] })],
    ["local_changes", health({ dirty: true })],
    ["attribution_warning", health({ attribution: "warning" })],
    ["unknown", health({ upstream: upstream({ state: "stale" }) })],
  ] as const)("assigns the factual %s state deterministically", (expected, result) => {
    expect(result.state).toBe(expected);
    expect(result.label.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("score");
  });

  it("keeps unknown attribution separate from an otherwise healthy state", () => {
    const result = health();

    expect(result.state).toBe("healthy");
    expect(result.attribution).toMatchObject({ state: "unknown" });
    expect(result.reasons).toContain("Attribution has not been evaluated.");
  });

  it("uses unresolved conflicts as the highest-priority factual state", () => {
    const result = health({
      dirty: true,
      conflicts: ["README.md", "LICENSE"],
      upstream: upstream({ state: "unreachable", behindCount: 3 }),
      attribution: "warning",
    });

    expect(result).toMatchObject({
      state: "conflicts",
      unresolvedConflictFiles: ["README.md", "LICENSE"],
    });
    expect(result.reasons[0]).toBe("2 unresolved conflicts detected.");
  });
});

describe("makeGitForkHealth", () => {
  it("reads only cached upstream and local Git state", async () => {
    const execute = vi.fn((_operation: string, _cwd: string, args: readonly string[]) =>
      Effect.succeed({
        code: 0,
        stdout: args[0] === "status" ? "?? local.txt\0" : "",
        stderr: "",
      }),
    );
    const readUpstream = vi.fn(() => Effect.succeed(upstream()));
    const readAttribution = vi.fn(() =>
      Effect.succeed({
        state: "ready" as const,
        message: "No removed or modified attribution files were found relative to cached upstream.",
        localRef: "HEAD",
        upstreamRef: "refs/remotes/upstream/main",
        warningCount: 0,
        files: [],
      }),
    );
    const service = makeGitForkHealth({
      execute,
      upstreamStatus: readUpstream,
      attributionGuardian: readAttribution,
    });

    const result = await Effect.runPromise(service.read("/repo"));

    expect(result.state).toBe("local_changes");
    expect(readUpstream).toHaveBeenCalledOnce();
    expect(readAttribution).toHaveBeenCalledWith("/repo", upstream());
    expect(execute.mock.calls.map((call) => call[2])).toEqual([
      ["status", "--porcelain=v1", "-z"],
      ["diff", "--name-only", "--diff-filter=U", "-z"],
    ]);
    expect(execute.mock.calls.flatMap((call) => call[2])).not.toContain("fetch");
    expect(execute.mock.calls.flatMap((call) => call[2])).not.toContain("ls-remote");
  });

  it("keeps fork health available when the attribution detail read fails", async () => {
    const execute = vi.fn(() => Effect.succeed({ code: 0, stdout: "", stderr: "" }));
    const service = makeGitForkHealth({
      execute,
      upstreamStatus: () => Effect.succeed(upstream()),
      attributionGuardian: (cwd) =>
        Effect.fail(
          new GitCommandError({
            operation: "GitCore.attributionGuardian",
            command: "git ls-tree",
            cwd,
            detail: "History read failed.",
          }),
        ),
    });

    const result = await Effect.runPromise(service.read("/repo"));

    expect(result).toMatchObject({
      state: "healthy",
      attribution: {
        state: "unknown",
        message:
          "Attribution comparison could not be completed. Open Attribution Guardian to retry.",
      },
    });
  });
});
