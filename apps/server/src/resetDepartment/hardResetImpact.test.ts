import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { inspectHardResetImpact, parseHardResetImpactStatus } from "./hardResetImpact";

const execFile = promisify(execFileCallback);
const temporaryRoots: string[] = [];
const inspectionCommands: string[][] = [];

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFile("git", [...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Forkara Test",
      GIT_AUTHOR_EMAIL: "test@forkara.invalid",
      GIT_COMMITTER_NAME: "Forkara Test",
      GIT_COMMITTER_EMAIL: "test@forkara.invalid",
    },
  });
  return result.stdout.trim();
}

function executeGit(request: {
  readonly cwd: string;
  readonly args: ReadonlyArray<string>;
  readonly allowNonZeroExit?: boolean;
}) {
  inspectionCommands.push([...request.args]);
  return Effect.promise(async () => {
    try {
      const result = await execFile("git", [...request.args], {
        cwd: request.cwd,
        encoding: "utf8",
      });
      return { code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (cause) {
      const error = cause as Error & {
        readonly code?: number;
        readonly stdout?: string;
        readonly stderr?: string;
      };
      if (request.allowNonZeroExit && typeof error.code === "number") {
        return {
          code: error.code,
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? error.message,
        };
      }
      throw error;
    }
  });
}

async function makeRepository(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "forkara-reset-impact-"));
  temporaryRoots.push(root);
  await git(root, ["init", "-b", "main"]);
  await fs.writeFile(path.join(root, "tracked.txt"), "base\n");
  await git(root, ["add", "tracked.txt"]);
  await git(root, ["commit", "-m", "initial"]);
  return root;
}

async function inspect(cwd: string) {
  return await Effect.runPromise(inspectHardResetImpact({ cwd, fileSystem: fs, executeGit }));
}

afterEach(async () => {
  inspectionCommands.length = 0;
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("hard-reset impact inspection", () => {
  it("parses staged, unstaged, untracked, and conflict records independently", () => {
    const parsed = parseHardResetImpactStatus(
      [
        "1 M. N... 100644 100644 100644 a b staged.txt",
        "1 .M N... 100644 100644 100644 a b dirty.txt",
        "? untracked.txt",
        "u UU N... 100644 100644 100644 100644 a b c conflict.txt",
        "",
      ].join("\0"),
    );
    expect(parsed).toEqual({
      stagedTracked: ["staged.txt"],
      unstagedTracked: ["dirty.txt"],
      untracked: ["untracked.txt"],
      conflicts: ["conflict.txt"],
    });
  });

  it("parses renamed paths and preserves valid whitespace in porcelain-v2 paths", () => {
    const parsed = parseHardResetImpactStatus(
      [
        "2 R. N... 100644 100644 100644 a b R100 renamed file.txt",
        "old file.txt",
        "?  leading-and-trailing.txt ",
        "",
      ].join("\0"),
    );
    expect(parsed).toEqual({
      stagedTracked: ["renamed file.txt"],
      unstagedTracked: [],
      untracked: [" leading-and-trailing.txt "],
      conflicts: [],
    });
  });

  it("reports a clean repository and fingerprints state drift", async () => {
    const root = await makeRepository();
    const clean = await inspect(root);
    expect(clean).toMatchObject({
      repositoryState: "ready",
      workspaceRoot: root,
      repositoryRoot: root,
      branch: "main",
      detached: false,
      stagedTracked: [],
      unstagedTracked: [],
      untracked: [],
      conflicts: [],
      operationState: "none",
    });
    expect(clean.head).toBe(await git(root, ["rev-parse", "HEAD"]));
    expect(clean.repositoryIdentity).toMatch(/^[0-9a-f]{64}$/u);
    expect(clean.fingerprint).toMatch(/^[0-9a-f]{64}$/u);

    await fs.writeFile(path.join(root, "tracked.txt"), "dirty\n");
    await fs.writeFile(path.join(root, "staged.txt"), "staged\n");
    await git(root, ["add", "staged.txt"]);
    await fs.writeFile(path.join(root, "untracked.txt"), "untracked\n");
    const dirty = await inspect(root);
    expect(dirty.stagedTracked).toEqual(["staged.txt"]);
    expect(dirty.unstagedTracked).toEqual(["tracked.txt"]);
    expect(dirty.untracked).toEqual(["untracked.txt"]);
    expect(dirty.fingerprint).not.toBe(clean.fingerprint);

    await fs.writeFile(path.join(root, "tracked.txt"), "different dirty contents\n");
    const contentChanged = await inspect(root);
    expect(contentChanged.unstagedTracked).toEqual(dirty.unstagedTracked);
    expect(contentChanged.fingerprint).not.toBe(dirty.fingerprint);
    expect(
      inspectionCommands.every((args) =>
        ["rev-parse", "symbolic-ref", "status", "diff"].includes(args[0] ?? ""),
      ),
    ).toBe(true);
  });

  it("reports detached HEAD without inventing a branch", async () => {
    const root = await makeRepository();
    await git(root, ["checkout", "--detach", "HEAD"]);

    await expect(inspect(root)).resolves.toMatchObject({
      repositoryState: "ready",
      branch: null,
      detached: true,
    });
  });

  it("reports merge conflicts and their active operation", async () => {
    const root = await makeRepository();
    await git(root, ["checkout", "-b", "conflicting"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "branch\n");
    await git(root, ["commit", "-am", "branch change"]);
    await git(root, ["checkout", "main"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "main\n");
    await git(root, ["commit", "-am", "main change"]);
    await expect(git(root, ["merge", "conflicting"])).rejects.toThrow();

    await expect(inspect(root)).resolves.toMatchObject({
      operationState: "merge",
      conflicts: ["tracked.txt"],
    });
  });

  it("reports rebase state without guessing it is a merge", async () => {
    const root = await makeRepository();
    await git(root, ["checkout", "-b", "rebasing"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "branch\n");
    await git(root, ["commit", "-am", "branch change"]);
    await git(root, ["checkout", "main"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "main\n");
    await git(root, ["commit", "-am", "main change"]);
    await git(root, ["checkout", "rebasing"]);
    await expect(git(root, ["rebase", "main"])).rejects.toThrow();

    await expect(inspect(root)).resolves.toMatchObject({
      operationState: "rebase",
      conflicts: ["tracked.txt"],
    });
  });

  it("keeps repository facts unknown outside a Git worktree", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "forkara-reset-nonrepo-"));
    temporaryRoots.push(root);

    await expect(inspect(root)).resolves.toEqual({
      repositoryState: "not-repository",
      workspaceRoot: root,
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
    });
  });
});
