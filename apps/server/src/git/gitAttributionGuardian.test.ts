import type { GitUpstreamStatusResult } from "@forkara/contracts";
import { Effect } from "effect";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { GitCommandError } from "./Errors.ts";
import {
  isRecognizedAttributionPath,
  makeGitAttributionGuardian,
} from "./gitAttributionGuardian.ts";

function upstream(): GitUpstreamStatusResult {
  return {
    state: "ready",
    hasUpstream: true,
    localBranch: "built-from-scratch",
    upstreamBranch: "main",
    aheadCount: 1,
    behindCount: 0,
    lastSuccessfulFetchAt: "2026-08-23T12:00:00.000Z",
    checkedAt: "2026-08-23T12:01:00.000Z",
    message: "Fork is ahead of upstream.",
  };
}

function makeRepositoryGit(repo: string) {
  return (args: readonly string[], allowFailure = false) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    if (!allowFailure && result.status !== 0) throw new Error(result.stderr);
    return {
      code: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };
}

function makeExecute(repo: string) {
  const git = makeRepositoryGit(repo);
  return (
    operation: string,
    cwd: string,
    args: readonly string[],
    options?: { readonly allowNonZeroExit?: boolean },
  ) => {
    const result = git(args, true);
    if (result.code !== 0 && !options?.allowNonZeroExit) {
      return Effect.fail(
        new GitCommandError({
          operation,
          command: `git ${args.join(" ")}`,
          cwd,
          detail: result.stderr.trim() || "Git command failed.",
        }),
      );
    }
    return Effect.succeed(result);
  };
}

async function initializeRepository(repo: string) {
  const git = makeRepositoryGit(repo);
  git(["init", "-b", "built-from-scratch"]);
  git(["config", "user.name", "Forkara Test"]);
  git(["config", "user.email", "forkara@example.com"]);
  return git;
}

describe("Attribution Guardian path recognition", () => {
  it("recognizes common names without treating similarly named directories as files", () => {
    expect(isRecognizedAttributionPath("LICENSE")).toBe(true);
    expect(isRecognizedAttributionPath("legal/NOTICE.md")).toBe(true);
    expect(isRecognizedAttributionPath("licenses/MIT.txt")).toBe(false);
    expect(isRecognizedAttributionPath("src/licenseChecker.ts")).toBe(false);
  });
});

describe("makeGitAttributionGuardian", () => {
  it("reports additions, deletions, modifications, patches, and unchanged files without mutation", async () => {
    const repo = await mkdtemp(join(tmpdir(), "forkara-attribution-"));
    try {
      const git = await initializeRepository(repo);
      await mkdir(join(repo, "legal"));
      await writeFile(join(repo, "LICENSE"), "upstream license\n");
      await writeFile(join(repo, "NOTICE"), "upstream notice\n");
      await writeFile(join(repo, "legal", "COPYRIGHT.md"), "unchanged copyright\n");
      git(["add", "."]);
      git(["commit", "-m", "upstream attribution"]);
      git(["update-ref", "refs/remotes/upstream/main", "HEAD"]);

      await writeFile(join(repo, "LICENSE"), "fork license text\n");
      git(["rm", "NOTICE"]);
      await writeFile(join(repo, "COPYING.md"), "new fork copying notice\n");
      git(["add", "."]);
      git(["commit", "-m", "fork attribution changes"]);
      const beforeHead = git(["rev-parse", "HEAD"]).stdout.trim();
      const beforeStatus = git(["status", "--porcelain"]).stdout;

      const service = makeGitAttributionGuardian({
        execute: makeExecute(repo),
        upstreamStatus: () => Effect.succeed(upstream()),
      });
      const result = await Effect.runPromise(service.read(repo));

      expect(result).toMatchObject({ state: "ready", warningCount: 2 });
      expect(result.files.map(({ path, change, warning }) => ({ path, change, warning }))).toEqual([
        { path: "COPYING.md", change: "added", warning: false },
        { path: "legal/COPYRIGHT.md", change: "unchanged", warning: false },
        { path: "LICENSE", change: "modified", warning: true },
        { path: "NOTICE", change: "deleted", warning: true },
      ]);
      expect(result.files.find((file) => file.path === "LICENSE")?.diff).toContain(
        "+fork license text",
      );
      expect(result.files.find((file) => file.path === "NOTICE")?.diff).toContain(
        "-upstream notice",
      );
      expect(result.message).toContain("not legal advice");
      expect(git(["rev-parse", "HEAD"]).stdout.trim()).toBe(beforeHead);
      expect(git(["status", "--porcelain"]).stdout).toBe(beforeStatus);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("returns a factual empty result when neither ref has a recognized file", async () => {
    const repo = await mkdtemp(join(tmpdir(), "forkara-attribution-empty-"));
    try {
      const git = await initializeRepository(repo);
      await writeFile(join(repo, "README.md"), "No license file yet.\n");
      git(["add", "."]);
      git(["commit", "-m", "initial"]);
      git(["update-ref", "refs/remotes/upstream/main", "HEAD"]);
      const service = makeGitAttributionGuardian({
        execute: makeExecute(repo),
        upstreamStatus: () => Effect.succeed(upstream()),
      });

      const result = await Effect.runPromise(service.read(repo));

      expect(result).toMatchObject({ state: "ready", warningCount: 0, files: [] });
      expect(result.message).toContain("No recognized");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("does not guess when upstream is unavailable", async () => {
    const service = makeGitAttributionGuardian({
      execute: () => Effect.die("Git must not run without an upstream."),
      upstreamStatus: () =>
        Effect.succeed({
          ...upstream(),
          state: "missing",
          hasUpstream: false,
          upstreamBranch: null,
          lastSuccessfulFetchAt: null,
        }),
    });

    await expect(Effect.runPromise(service.read("/repo"))).resolves.toMatchObject({
      state: "missing_upstream",
      warningCount: 0,
      files: [],
    });
  });
});
