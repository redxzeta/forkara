import type { GitForkArchaeologyOverviewResult } from "@forkara/contracts";
import { Effect } from "effect";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { GitCommandError } from "./Errors.ts";
import { makeGitForkSpeedrun } from "./gitForkSpeedrun.ts";

const BASE_SHA = "1111111111111111111111111111111111111111";
const STARTED_AT = "2026-08-23T12:00:00.000Z";

function overview(
  overrides: Partial<GitForkArchaeologyOverviewResult> = {},
): GitForkArchaeologyOverviewResult {
  return {
    state: "ready",
    message: "Exact ancestry available.",
    localRef: "HEAD",
    upstreamRef: "refs/remotes/upstream/main",
    mergeBase: {
      sha: BASE_SHA,
      shortSha: BASE_SHA.slice(0, 7),
      subject: "Common base",
      authorName: "Ada",
      authoredAt: "2026-08-22T12:00:00.000Z",
      origin: "shared",
      upstreamUrl: null,
    },
    forkUniqueCount: 2,
    upstreamUniqueCount: 0,
    upstreamRepositoryUrl: null,
    ...overrides,
  };
}

function record(sha: string, committedAt: string, subject: string): string {
  return `${sha}\x1f${sha.slice(0, 7)}\x1f${committedAt}\x1f${subject}\x1e`;
}

describe("makeGitForkSpeedrun", () => {
  it("reads the fork range and nested README path history from a temporary repository", async () => {
    const repo = await mkdtemp(join(tmpdir(), "forkara-speedrun-"));
    const git = (args: readonly string[], committedAt?: string) => {
      const result = spawnSync("git", args, {
        cwd: repo,
        encoding: "utf8",
        env: committedAt
          ? { ...process.env, GIT_AUTHOR_DATE: committedAt, GIT_COMMITTER_DATE: committedAt }
          : process.env,
      });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    try {
      git(["init", "-b", "built-from-scratch"]);
      git(["config", "user.name", "Forkara Test"]);
      git(["config", "user.email", "forkara@example.com"]);
      await writeFile(join(repo, "tracked.txt"), "base\n");
      git(["add", "tracked.txt"]);
      git(["commit", "-m", "shared base"], "2026-08-23T11:00:00Z");
      const baseSha = git(["rev-parse", "HEAD"]);
      await writeFile(join(repo, "tracked.txt"), "base\nfork\n");
      git(["commit", "-am", "first fork work"], "2026-08-23T12:02:00Z");
      await mkdir(join(repo, "docs"));
      await writeFile(join(repo, "docs", "ReadMe.md"), "fork docs\n");
      git(["add", "docs/ReadMe.md"]);
      git(["commit", "-m", "write nested readme"], "2026-08-23T12:08:41Z");

      const execute = (
        operation: string,
        cwd: string,
        args: readonly string[],
        options?: { readonly allowNonZeroExit?: boolean },
      ) => {
        const result = spawnSync("git", args, { cwd, encoding: "utf8" });
        const code = result.status ?? 1;
        if (code !== 0 && !options?.allowNonZeroExit) {
          return Effect.fail(
            new GitCommandError({
              operation,
              command: `git ${args.join(" ")}`,
              cwd,
              detail: result.stderr.trim() || "Git command failed.",
            }),
          );
        }
        return Effect.succeed({ code, stdout: result.stdout, stderr: result.stderr });
      };
      const service = makeGitForkSpeedrun({
        execute,
        forkArchaeologyOverview: () =>
          Effect.succeed(
            overview({
              mergeBase: { ...overview().mergeBase!, sha: baseSha, shortSha: baseSha.slice(0, 7) },
            }),
          ),
      });

      const result = await Effect.runPromise(service.read({ cwd: repo, startedAt: STARTED_AT }));

      expect(result.events).toEqual([
        expect.objectContaining({ kind: "project_added", elapsedSeconds: 0 }),
        expect.objectContaining({ kind: "first_fork_commit", elapsedSeconds: 120 }),
        expect.objectContaining({ kind: "readme_changed", elapsedSeconds: 521 }),
      ]);
      expect(result.missingEvents).toEqual([]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("derives real post-add milestones and elapsed times from bounded local logs", async () => {
    const oldSha = "2".repeat(40);
    const firstSha = "3".repeat(40);
    const readmeSha = "4".repeat(40);
    const laterSha = "5".repeat(40);
    const execute = vi.fn((_operation: string, _cwd: string, args: readonly string[]) => {
      const readmeOnly = args.includes(":(icase,glob)README*");
      return Effect.succeed({
        code: 0,
        stdout: readmeOnly
          ? record(readmeSha, "2026-08-23T12:08:41.000Z", "Rewrite README")
          : record(oldSha, "2026-08-23T11:00:00.000Z", "Existing work") +
            record(laterSha, "2026-08-23T12:20:00.000Z", "Topologically first") +
            record(firstSha, "2026-08-23T12:02:00.000Z", "First local work") +
            record(readmeSha, "2026-08-23T12:08:41.000Z", "Rewrite README"),
        stderr: "",
      });
    });
    const service = makeGitForkSpeedrun({
      execute,
      forkArchaeologyOverview: () => Effect.succeed(overview()),
    });

    const result = await Effect.runPromise(service.read({ cwd: "/repo", startedAt: STARTED_AT }));

    expect(result.state).toBe("ready");
    expect(result.events).toEqual([
      expect.objectContaining({ kind: "project_added", elapsedSeconds: 0, commit: null }),
      expect.objectContaining({
        kind: "first_fork_commit",
        elapsedSeconds: 120,
        commit: expect.objectContaining({ sha: firstSha }),
      }),
      expect.objectContaining({
        kind: "readme_changed",
        elapsedSeconds: 521,
        commit: expect.objectContaining({ sha: readmeSha }),
      }),
    ]);
    expect(result.missingEvents).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.flatMap((call) => call[2])).not.toContain("fetch");
  });

  it("does not invent timestamps for milestones absent after the project was added", async () => {
    const execute = vi.fn(() =>
      Effect.succeed({
        code: 0,
        stdout: record("2".repeat(40), "2026-08-23T11:00:00.000Z", "Old work"),
        stderr: "",
      }),
    );
    const service = makeGitForkSpeedrun({
      execute,
      forkArchaeologyOverview: () => Effect.succeed(overview()),
    });

    const result = await Effect.runPromise(service.read({ cwd: "/repo", startedAt: STARTED_AT }));

    expect(result.events.map((event) => event.kind)).toEqual(["project_added"]);
    expect(result.missingEvents).toEqual(["first_fork_commit", "readme_changed"]);
  });

  it("keeps incomplete provenance local and explicit without running milestone logs", async () => {
    const execute = vi.fn();
    const service = makeGitForkSpeedrun({
      execute,
      forkArchaeologyOverview: () =>
        Effect.succeed(overview({ state: "incomplete_history", mergeBase: null })),
    });

    const result = await Effect.runPromise(service.read({ cwd: "/repo", startedAt: STARTED_AT }));

    expect(result).toMatchObject({
      state: "incomplete_history",
      events: [{ kind: "project_added", occurredAt: STARTED_AT, elapsedSeconds: 0 }],
      missingEvents: ["first_fork_commit", "readme_changed"],
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
