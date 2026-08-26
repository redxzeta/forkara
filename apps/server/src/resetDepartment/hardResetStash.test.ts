import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { HardResetImpactSnapshot, HardResetStashInput } from "@forkara/contracts";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { makeResetDepartmentService } from "./Layers/ResetDepartmentService";
import {
  git,
  makeRepository,
  makeTestGitCore,
  removeTemporaryRoots,
} from "./resetDepartmentTestRepository";

function stashInput(cwd: string, snapshot: HardResetImpactSnapshot): HardResetStashInput {
  if (
    snapshot.repositoryIdentity === null ||
    snapshot.head === null ||
    snapshot.fingerprint === null
  ) {
    throw new Error("Expected a ready hard-reset snapshot.");
  }
  return {
    cwd,
    expectedRepositoryIdentity: snapshot.repositoryIdentity,
    expectedHead: snapshot.head,
    expectedFingerprint: snapshot.fingerprint,
  };
}

afterEach(removeTemporaryRoots);

describe("hard-reset safer stash", () => {
  it("stashes staged, unstaged, and untracked changes while preserving ignored files", async () => {
    const root = await makeRepository("forkara-reset-stash-");
    await fs.writeFile(path.join(root, ".gitignore"), "ignored.txt\n");
    await git(root, ["add", ".gitignore"]);
    await git(root, ["commit", "-m", "ignore fixture"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "unstaged\n");
    await fs.writeFile(path.join(root, "staged.txt"), "staged\n");
    await git(root, ["add", "staged.txt"]);
    await fs.writeFile(path.join(root, "untracked.txt"), "untracked\n");
    await fs.writeFile(path.join(root, "ignored.txt"), "ignored\n");

    const commands: string[][] = [];
    const mutationCwds: string[] = [];
    const service = makeResetDepartmentService({
      fs,
      git: makeTestGitCore({ commands, mutationCwds }),
    });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
    const result = await Effect.runPromise(
      service.stashHardResetChanges(stashInput(root, preview)),
    );

    expect(result.status).toBe("stashed");
    expect(result.snapshot).toMatchObject({
      stagedTracked: [],
      unstagedTracked: [],
      untracked: [],
      conflicts: [],
    });
    expect(result.snapshot.fingerprint).not.toBe(preview.fingerprint);
    expect(mutationCwds).toEqual([root]);
    expect(commands.filter((args) => args[0] === "stash")).toEqual([
      [
        "stash",
        "push",
        "--include-untracked",
        "-m",
        "Forkara Reset Department: stash before hard reset",
      ],
    ]);
    await expect(fs.readFile(path.join(root, "ignored.txt"), "utf8")).resolves.toBe("ignored\n");
    await expect(fs.readFile(path.join(root, "untracked.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.readFile(path.join(root, "tracked.txt"), "utf8")).resolves.toBe("base\n");
    const stashedNames = await git(root, [
      "stash",
      "show",
      "--include-untracked",
      "--name-only",
      "stash@{0}",
    ]);
    expect(stashedNames).toContain("staged.txt");
    expect(stashedNames).toContain("tracked.txt");
    expect(stashedNames).toContain("untracked.txt");
    expect(stashedNames).not.toContain("ignored.txt");
  });

  it("treats a clean tree as a successful no-op without invoking stash", async () => {
    const root = await makeRepository("forkara-reset-stash-clean-");
    const commands: string[][] = [];
    const service = makeResetDepartmentService({ fs, git: makeTestGitCore({ commands }) });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));

    await expect(
      Effect.runPromise(service.stashHardResetChanges(stashInput(root, preview))),
    ).resolves.toEqual({ status: "nothing-to-stash", snapshot: preview });
    expect(commands.some((args) => args[0] === "stash")).toBe(false);
  });

  it("rejects repository identity, HEAD, fingerprint, and worktree drift before stash", async () => {
    const root = await makeRepository("forkara-reset-stash-stale-");
    const commands: string[][] = [];
    const service = makeResetDepartmentService({ fs, git: makeTestGitCore({ commands }) });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
    const input = stashInput(root, preview);

    for (const staleInput of [
      { ...input, expectedRepositoryIdentity: "f".repeat(64) },
      { ...input, expectedHead: "wrong-head" },
      { ...input, expectedFingerprint: "e".repeat(64) },
    ]) {
      await expect(
        Effect.runPromise(service.stashHardResetChanges(staleInput)),
      ).rejects.toMatchObject({ reason: "stale-preview" });
    }

    await fs.writeFile(path.join(root, "tracked.txt"), "changed after preview\n");
    await expect(Effect.runPromise(service.stashHardResetChanges(input))).rejects.toMatchObject({
      reason: "stale-preview",
    });
    expect(commands.some((args) => args[0] === "stash")).toBe(false);
  });

  it("surfaces stash failure without dropping changes", async () => {
    const root = await makeRepository("forkara-reset-stash-failure-");
    await fs.writeFile(path.join(root, "tracked.txt"), "keep me\n");
    const service = makeResetDepartmentService({
      fs,
      git: makeTestGitCore({ failCommand: (args) => args[0] === "stash" }),
    });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));

    await expect(
      Effect.runPromise(service.stashHardResetChanges(stashInput(root, preview))),
    ).rejects.toMatchObject({ reason: "stash-failed" });
    await expect(fs.readFile(path.join(root, "tracked.txt"), "utf8")).resolves.toBe("keep me\n");
    await expect(git(root, ["stash", "list", "--format=%H"])).resolves.toBe("");
  });
});
