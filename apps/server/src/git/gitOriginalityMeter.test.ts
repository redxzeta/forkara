import type { GitForkArchaeologyOverviewResult } from "@forkara/contracts";
import { Effect } from "effect";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { GitCommandError } from "./Errors.ts";

import {
  calculateOriginality,
  isOriginalityExcludedPath,
  makeGitOriginalityMeter,
  parseOriginalityNumstat,
} from "./gitOriginalityMeter.ts";

const BASE_SHA = "1111111111111111111111111111111111111111";

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
      authoredAt: "2026-08-23T12:00:00.000Z",
      origin: "shared",
      upstreamUrl: null,
    },
    forkUniqueCount: 2,
    upstreamUniqueCount: 3,
    upstreamRepositoryUrl: null,
    ...overrides,
  };
}

describe("originality calculation", () => {
  it("scores identical, partially changed, and heavily changed trees deterministically", () => {
    const paths = ["a.ts", "b.ts", "c.ts", "d.ts"];

    expect(calculateOriginality({ basePaths: paths, headPaths: paths, entries: [] })).toMatchObject(
      {
        scorePercent: 0,
        changedFileCount: 0,
        comparableFileCount: 4,
      },
    );
    expect(
      calculateOriginality({
        basePaths: paths,
        headPaths: paths,
        entries: [{ path: "a.ts", previousPath: null, insertions: 3, deletions: 1, binary: false }],
      }),
    ).toMatchObject({
      scorePercent: 25,
      changedFileCount: 1,
      comparableFileCount: 4,
      insertions: 3,
      deletions: 1,
    });
    expect(
      calculateOriginality({
        basePaths: paths,
        headPaths: paths,
        entries: paths.map((path) => ({
          path,
          previousPath: null,
          insertions: 1,
          deletions: 1,
          binary: false,
        })),
      }),
    ).toMatchObject({ scorePercent: 100, changedFileCount: 4, comparableFileCount: 4 });
  });

  it("excludes documented generated, vendor, lock, and binary files", () => {
    const entries = parseOriginalityNumstat(
      ["5\t2\tsrc/app.ts", "1\t1\tdist/bundle.js", "-\t-\tassets/logo.png", ""].join("\0"),
    );
    const result = calculateOriginality({
      basePaths: ["src/app.ts", "dist/bundle.js", "assets/logo.png", "bun.lock"],
      headPaths: ["src/app.ts", "dist/bundle.js", "assets/logo.png", "bun.lock"],
      entries,
    });

    expect(result).toEqual({
      scorePercent: 100,
      changedFileCount: 1,
      comparableFileCount: 1,
      insertions: 5,
      deletions: 2,
      binaryFileCount: 1,
      excludedFileCount: 3,
    });
    expect(isOriginalityExcludedPath("vendor/sdk/client.ts")).toBe(true);
    expect(isOriginalityExcludedPath("src/schema.generated.ts")).toBe(true);
    expect(isOriginalityExcludedPath("src/application.ts")).toBe(false);
  });

  it("treats a detected rename as one comparable changed file", () => {
    const entries = parseOriginalityNumstat("0\t0\t\0old.ts\0new.ts\0");

    expect(
      calculateOriginality({ basePaths: ["old.ts"], headPaths: ["new.ts"], entries }),
    ).toMatchObject({ scorePercent: 100, changedFileCount: 1, comparableFileCount: 1 });
  });
});

describe("makeGitOriginalityMeter", () => {
  it("calculates from real committed trees while excluding vendor changes", async () => {
    const repo = await mkdtemp(join(tmpdir(), "forkara-originality-"));
    const git = (args: readonly string[]) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    try {
      git(["init", "-b", "main"]);
      git(["config", "user.name", "Forkara Test"]);
      git(["config", "user.email", "forkara@example.com"]);
      await mkdir(join(repo, "vendor"));
      await Promise.all([
        writeFile(join(repo, "a.ts"), "base\n"),
        writeFile(join(repo, "b.ts"), "base\n"),
        writeFile(join(repo, "c.ts"), "base\n"),
        writeFile(join(repo, "d.ts"), "base\n"),
        writeFile(join(repo, "vendor", "sdk.ts"), "generated base\n"),
      ]);
      git(["add", "."]);
      git(["commit", "-m", "base"]);
      const baseSha = git(["rev-parse", "HEAD"]);
      await writeFile(join(repo, "a.ts"), "base\nfork change\n");
      await writeFile(join(repo, "vendor", "sdk.ts"), "generated fork change\n");
      git(["commit", "-am", "fork changes"]);

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
      const service = makeGitOriginalityMeter({
        execute,
        forkArchaeologyOverview: () =>
          Effect.succeed(
            overview({
              mergeBase: {
                ...overview().mergeBase!,
                sha: baseSha,
                shortSha: baseSha.slice(0, 7),
              },
            }),
          ),
      });

      const result = await Effect.runPromise(service.read(repo));

      expect(result).toMatchObject({
        scorePercent: 25,
        changedFileCount: 1,
        comparableFileCount: 4,
        insertions: 1,
        deletions: 0,
        excludedFileCount: 1,
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("reuses exact archaeology provenance and performs only bounded local Git reads", async () => {
    const execute = vi.fn((_operation: string, _cwd: string, args: readonly string[]) => {
      if (args[0] === "diff") {
        return Effect.succeed({ code: 0, stdout: "2\t1\tsrc/app.ts\0", stderr: "" });
      }
      return Effect.succeed({ code: 0, stdout: "src/app.ts\0src/other.ts\0", stderr: "" });
    });
    const service = makeGitOriginalityMeter({
      execute,
      forkArchaeologyOverview: () => Effect.succeed(overview()),
    });

    const result = await Effect.runPromise(service.read("/repo"));

    expect(result).toMatchObject({
      state: "ready",
      scorePercent: 50,
      changedFileCount: 1,
      comparableFileCount: 2,
      forkUniqueCommitCount: 2,
      upstreamUniqueCommitCount: 3,
      calculationVersion: "changed_eligible_files_v1",
    });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls.map((call) => call[2][0]).toSorted()).toEqual([
      "diff",
      "ls-tree",
      "ls-tree",
    ]);
    expect(execute.mock.calls.find((call) => call[2][0] === "diff")?.[2]).toEqual([
      "diff",
      "--numstat",
      "-z",
      "--find-renames",
      BASE_SHA,
      "HEAD",
    ]);
  });

  it("preserves missing, incomplete, and unrelated provenance without guessing a score", async () => {
    for (const state of ["missing_upstream", "incomplete_history", "unrelated_history"] as const) {
      const execute = vi.fn();
      const service = makeGitOriginalityMeter({
        execute,
        forkArchaeologyOverview: () =>
          Effect.succeed(overview({ state, mergeBase: null, forkUniqueCount: 0 })),
      });

      const result = await Effect.runPromise(service.read("/repo"));

      expect(result).toMatchObject({ state, scorePercent: null });
      expect(execute).not.toHaveBeenCalled();
    }
  });
});
