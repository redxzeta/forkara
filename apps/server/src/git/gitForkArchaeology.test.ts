import type { GitUpstreamStatusResult } from "@forkara/contracts";
import { Effect } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import { GitCommandError } from "./Errors.ts";
import {
  makeGitForkArchaeology,
  normalizeArchaeologyFilePath,
  upstreamWebRepositoryUrl,
} from "./gitForkArchaeology.ts";

const BASE_SHA = "1111111111111111111111111111111111111111";
const FORK_SHA = "2222222222222222222222222222222222222222";
const SHARED_SHA = "3333333333333333333333333333333333333333";

function upstream(): GitUpstreamStatusResult {
  return {
    state: "ready",
    hasUpstream: true,
    localBranch: "built-from-scratch",
    upstreamBranch: "main",
    aheadCount: 2,
    behindCount: 3,
    lastSuccessfulFetchAt: "2026-08-23T12:00:00.000Z",
    checkedAt: "2026-08-23T12:01:00.000Z",
    message: "Fork has diverged.",
  };
}

function record(sha: string, subject: string): string {
  return `${sha}\x1f${sha.slice(0, 7)}\x1f${subject}\x1fAda\x1f2026-08-23T12:00:00+00:00\x1e`;
}

function makeExecute(options?: { mergeBase?: boolean; shallow?: boolean }) {
  return vi.fn((_operation: string, _cwd: string, args: readonly string[]) => {
    if (args[0] === "show-ref") return Effect.succeed({ code: 0, stdout: "", stderr: "" });
    if (args[0] === "remote") {
      return Effect.succeed({
        code: 0,
        stdout: "git@github.com:upstream/project.git\n",
        stderr: "",
      });
    }
    if (args[0] === "rev-parse" && args.includes("--is-shallow-repository")) {
      return Effect.succeed({
        code: 0,
        stdout: options?.shallow ? "true\n" : "false\n",
        stderr: "",
      });
    }
    if (args[0] === "rev-parse") {
      return Effect.succeed({ code: 0, stdout: `${FORK_SHA}\n`, stderr: "" });
    }
    if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
      return Effect.succeed({
        code: args[2] === SHARED_SHA ? 0 : 1,
        stdout: "",
        stderr: "",
      });
    }
    if (args[0] === "merge-base") {
      return Effect.succeed({
        code: options?.mergeBase === false ? 1 : 0,
        stdout: options?.mergeBase === false ? "" : `${BASE_SHA}\n`,
        stderr: "",
      });
    }
    if (args[0] === "rev-list") {
      return Effect.succeed({
        code: 0,
        stdout: args[2] === "HEAD" ? "2\n" : "3\n",
        stderr: "",
      });
    }
    if (args[0] === "show") {
      return Effect.succeed({ code: 0, stdout: record(BASE_SHA, "Common base"), stderr: "" });
    }
    if (args[0] === "log" && args.includes("--follow")) {
      return Effect.succeed({
        code: 0,
        stdout: record(FORK_SHA, "Fork edit") + record(SHARED_SHA, "Upstream edit"),
        stderr: "",
      });
    }
    if (args[0] === "log") {
      return Effect.succeed({
        code: 0,
        stdout:
          record(FORK_SHA, "First") + record(SHARED_SHA, "Second") + record(BASE_SHA, "Sentinel"),
        stderr: "",
      });
    }
    throw new Error(`Unexpected git arguments: ${args.join(" ")}`);
  });
}

describe("fork archaeology path and URL normalization", () => {
  it("accepts repository-relative paths and rejects traversal or absolute paths", () => {
    expect(normalizeArchaeologyFilePath("./apps/web/src/App.tsx")).toBe("apps/web/src/App.tsx");
    expect(normalizeArchaeologyFilePath("../secret.txt")).toBeNull();
    expect(normalizeArchaeologyFilePath("/tmp/secret.txt")).toBeNull();
    expect(normalizeArchaeologyFilePath("C:\\secret.txt")).toBeNull();
  });

  it("links only recognized GitHub upstream URLs", () => {
    expect(upstreamWebRepositoryUrl("git@github.com:owner/repo.git")).toBe(
      "https://github.com/owner/repo",
    );
    expect(upstreamWebRepositoryUrl("https://example.com/owner/repo.git")).toBeNull();
  });
});

describe("makeGitForkArchaeology", () => {
  it("reads real divergent and selected-file history from a temporary repository", async () => {
    const repo = await mkdtemp(join(tmpdir(), "forkara-archaeology-"));
    const git = (args: readonly string[]) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    try {
      git(["init", "-b", "built-from-scratch"]);
      git(["config", "user.name", "Forkara Test"]);
      git(["config", "user.email", "forkara@example.com"]);
      await writeFile(join(repo, "tracked.txt"), "base\n");
      git(["add", "tracked.txt"]);
      git(["commit", "-m", "base"]);
      const baseSha = git(["rev-parse", "HEAD"]);
      git(["remote", "add", "upstream", "git@github.com:upstream/project.git"]);
      git(["branch", "upstream-work", baseSha]);
      await writeFile(join(repo, "tracked.txt"), "base\nfork\n");
      git(["commit", "-am", "fork edit"]);
      git(["checkout", "upstream-work"]);
      await writeFile(join(repo, "upstream.txt"), "upstream\n");
      git(["add", "upstream.txt"]);
      git(["commit", "-m", "upstream edit"]);
      git(["update-ref", "refs/remotes/upstream/main", "HEAD"]);
      git(["checkout", "built-from-scratch"]);

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
      const service = makeGitForkArchaeology({
        execute,
        upstreamStatus: () => Effect.succeed(upstream()),
      });

      const result = await Effect.runPromise(service.overview(repo));
      const file = await Effect.runPromise(
        service.fileHistory({ cwd: repo, path: "tracked.txt", offset: 0, limit: 20 }),
      );

      expect(result).toMatchObject({
        state: "ready",
        forkUniqueCount: 1,
        upstreamUniqueCount: 1,
        mergeBase: { sha: baseSha, origin: "shared" },
      });
      expect(file.commits.map((commit) => commit.origin)).toEqual(["fork", "shared"]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("reports an exact merge-base, unique counts, and upstream receipt", async () => {
    const execute = makeExecute();
    const service = makeGitForkArchaeology({
      execute,
      upstreamStatus: () => Effect.succeed(upstream()),
    });

    const result = await Effect.runPromise(service.overview("/repo"));

    expect(result).toMatchObject({
      state: "ready",
      forkUniqueCount: 2,
      upstreamUniqueCount: 3,
      upstreamRepositoryUrl: "https://github.com/upstream/project",
      mergeBase: {
        sha: BASE_SHA,
        origin: "shared",
        upstreamUrl: `https://github.com/upstream/project/commit/${BASE_SHA}`,
      },
    });
    expect(execute.mock.calls.flatMap((call) => call[2])).not.toContain("fetch");
    expect(execute.mock.calls.flatMap((call) => call[2])).not.toContain("ls-remote");
  });

  it("distinguishes unrelated and shallow incomplete history", async () => {
    const unrelated = makeGitForkArchaeology({
      execute: makeExecute({ mergeBase: false }),
      upstreamStatus: () => Effect.succeed(upstream()),
    });
    const shallow = makeGitForkArchaeology({
      execute: makeExecute({ mergeBase: false, shallow: true }),
      upstreamStatus: () => Effect.succeed(upstream()),
    });

    expect(await Effect.runPromise(unrelated.overview("/repo"))).toMatchObject({
      state: "unrelated_history",
      mergeBase: null,
    });
    expect(await Effect.runPromise(shallow.overview("/repo"))).toMatchObject({
      state: "incomplete_history",
      mergeBase: null,
    });
  });

  it("reads bounded unique-commit pages with an explicit continuation offset", async () => {
    const execute = makeExecute();
    const service = makeGitForkArchaeology({
      execute,
      upstreamStatus: () => Effect.succeed(upstream()),
    });

    const page = await Effect.runPromise(
      service.commitPage({ cwd: "/repo", side: "fork", offset: 20, limit: 2 }),
    );

    expect(page.commits).toHaveLength(2);
    expect(page.nextOffset).toBe(22);
    expect(page.commits.every((commit) => commit.origin === "fork")).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      "GitCore.forkArchaeology.commitPage",
      "/repo",
      expect.arrayContaining(["--max-count=3", "--skip=20"]),
      expect.anything(),
    );
  });

  it("classifies selected-file commits only from exact upstream ancestry", async () => {
    const service = makeGitForkArchaeology({
      execute: makeExecute(),
      upstreamStatus: () => Effect.succeed(upstream()),
    });

    const history = await Effect.runPromise(
      service.fileHistory({ cwd: "/repo", path: "src/file.ts", offset: 0, limit: 20 }),
    );

    expect(history.state).toBe("available");
    expect(history.commits.map((commit) => [commit.sha, commit.origin])).toEqual([
      [FORK_SHA, "fork"],
      [SHARED_SHA, "shared"],
    ]);
    expect(history.commits[0]?.upstreamUrl).toBeNull();
    expect(history.commits[1]?.upstreamUrl).toContain("github.com/upstream/project/commit");
  });

  it("keeps selected-file origins unknown when history has no common ancestor", async () => {
    const service = makeGitForkArchaeology({
      execute: makeExecute({ mergeBase: false }),
      upstreamStatus: () => Effect.succeed(upstream()),
    });

    const history = await Effect.runPromise(
      service.fileHistory({ cwd: "/repo", path: "src/file.ts", offset: 0, limit: 20 }),
    );

    expect(history.commits).not.toHaveLength(0);
    expect(history.commits.every((commit) => commit.origin === "unknown")).toBe(true);
    expect(history.commits.every((commit) => commit.upstreamUrl === null)).toBe(true);
  });
});
