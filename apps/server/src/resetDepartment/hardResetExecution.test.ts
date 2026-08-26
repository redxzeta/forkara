import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { HardResetConfirmationInput, HardResetImpactSnapshot } from "@forkara/contracts";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { makeResetDepartmentService } from "./Layers/ResetDepartmentService";
import {
  git,
  makeRepository,
  makeTestGitCore,
  removeTemporaryRoots,
} from "./resetDepartmentTestRepository";

const CONFIRMATION = "git has receipts" as const;
const INSPECTION_COMMANDS = new Set(["rev-parse", "symbolic-ref", "status", "diff"]);

function resetInput(cwd: string, snapshot: HardResetImpactSnapshot): HardResetConfirmationInput {
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
    confirmation: CONFIRMATION,
  };
}

function mutationCommands(
  commands: readonly (readonly string[])[],
): readonly (readonly string[])[] {
  return commands.filter((args) => !INSPECTION_COMMANDS.has(args[0] ?? ""));
}

afterEach(removeTemporaryRoots);

describe("guarded hard reset", () => {
  it("resets staged and unstaged tracked changes while preserving untracked and ignored files", async () => {
    const root = await makeRepository("forkara-hard-reset-dirty-");
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
    const result = await Effect.runPromise(service.executeHardReset(resetInput(root, preview)));

    expect(result.status).toBe("reset-completed");
    expect(result.snapshot).toMatchObject({
      stagedTracked: [],
      unstagedTracked: [],
      untracked: ["untracked.txt"],
      conflicts: [],
      operationState: "none",
    });
    expect(mutationCwds).toEqual([root]);
    expect(mutationCommands(commands)).toEqual([["reset", "--hard", "HEAD"]]);
    await expect(fs.readFile(path.join(root, "tracked.txt"), "utf8")).resolves.toBe("base\n");
    await expect(fs.access(path.join(root, "staged.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.readFile(path.join(root, "untracked.txt"), "utf8")).resolves.toBe(
      "untracked\n",
    );
    await expect(fs.readFile(path.join(root, "ignored.txt"), "utf8")).resolves.toBe("ignored\n");
  });

  it("completes against a clean tree without adding any other mutation", async () => {
    const root = await makeRepository("forkara-hard-reset-clean-");
    const commands: string[][] = [];
    const service = makeResetDepartmentService({ fs, git: makeTestGitCore({ commands }) });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));

    await expect(
      Effect.runPromise(service.executeHardReset(resetInput(root, preview))),
    ).resolves.toMatchObject({
      status: "reset-completed",
      snapshot: { stagedTracked: [], unstagedTracked: [], untracked: [] },
    });
    expect(mutationCommands(commands)).toEqual([["reset", "--hard", "HEAD"]]);
  });

  it("rejects stale identity, HEAD, fingerprint, content, and repository guards", async () => {
    const root = await makeRepository("forkara-hard-reset-stale-");
    const otherRoot = await makeRepository("forkara-hard-reset-wrong-repository-");
    const commands: string[][] = [];
    const service = makeResetDepartmentService({ fs, git: makeTestGitCore({ commands }) });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
    const input = resetInput(root, preview);

    for (const staleInput of [
      { ...input, expectedRepositoryIdentity: "f".repeat(64) },
      { ...input, expectedHead: "wrong-head" },
      { ...input, expectedFingerprint: "e".repeat(64) },
      { ...input, cwd: otherRoot },
    ]) {
      await expect(Effect.runPromise(service.executeHardReset(staleInput))).rejects.toMatchObject({
        reason: "stale-preview",
      });
    }

    await fs.writeFile(path.join(root, "tracked.txt"), "changed after preview\n");
    await expect(Effect.runPromise(service.executeHardReset(input))).rejects.toMatchObject({
      reason: "stale-preview",
    });
    await git(root, ["restore", "tracked.txt"]);

    const headPreview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
    const headInput = resetInput(root, headPreview);
    await fs.writeFile(path.join(root, "next.txt"), "next\n");
    await git(root, ["add", "next.txt"]);
    await git(root, ["commit", "-m", "advance head"]);
    await expect(Effect.runPromise(service.executeHardReset(headInput))).rejects.toMatchObject({
      reason: "stale-preview",
    });
    expect(mutationCommands(commands)).toEqual([]);
  });

  it("blocks a bad confirmation before taking the mutation lock", async () => {
    const root = await makeRepository("forkara-hard-reset-confirmation-");
    const commands: string[][] = [];
    const mutationCwds: string[] = [];
    const service = makeResetDepartmentService({
      fs,
      git: makeTestGitCore({ commands, mutationCwds }),
    });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
    const badInput = {
      ...resetInput(root, preview),
      confirmation: "Git has receipts",
    } as unknown as HardResetConfirmationInput;

    await expect(Effect.runPromise(service.executeHardReset(badInput))).rejects.toMatchObject({
      reason: "reset-blocked",
    });
    expect(mutationCwds).toEqual([]);
    expect(mutationCommands(commands)).toEqual([]);
  });

  it("surfaces reset command failure without discarding tracked changes", async () => {
    const root = await makeRepository("forkara-hard-reset-failure-");
    await fs.writeFile(path.join(root, "tracked.txt"), "keep me\n");
    const commands: string[][] = [];
    const service = makeResetDepartmentService({
      fs,
      git: makeTestGitCore({
        commands,
        failCommand: (args) => args[0] === "reset",
      }),
    });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));

    await expect(
      Effect.runPromise(service.executeHardReset(resetInput(root, preview))),
    ).rejects.toMatchObject({ reason: "reset-failed" });
    expect(mutationCommands(commands)).toEqual([["reset", "--hard", "HEAD"]]);
    await expect(fs.readFile(path.join(root, "tracked.txt"), "utf8")).resolves.toBe("keep me\n");
  });

  it.each(["merge", "rebase"] as const)(
    "allows a prominently confirmable known %s state",
    async (operationState) => {
      const root = await makeRepository(`forkara-hard-reset-${operationState}-`);
      await fs.writeFile(path.join(root, "tracked.txt"), `${operationState}\n`);
      const commands: string[][] = [];
      const stateFs = {
        ...fs,
        access: async (...[candidate]: Parameters<typeof fs.access>) => {
          const candidatePath = String(candidate);
          if (operationState === "merge" && candidatePath.endsWith(`${path.sep}MERGE_HEAD`)) return;
          if (operationState === "rebase" && candidatePath.endsWith(`${path.sep}rebase-merge`)) {
            return;
          }
          throw Object.assign(new Error("missing operation marker"), { code: "ENOENT" });
        },
      };
      const service = makeResetDepartmentService({
        fs: stateFs,
        git: makeTestGitCore({ commands }),
      });
      const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
      expect(preview.operationState).toBe(operationState);

      await expect(
        Effect.runPromise(service.executeHardReset(resetInput(root, preview))),
      ).resolves.toMatchObject({ status: "reset-completed" });
      expect(mutationCommands(commands)).toEqual([["reset", "--hard", "HEAD"]]);
    },
  );

  it("allows a confirmed merge conflict and refreshes the resolved snapshot", async () => {
    const root = await makeRepository("forkara-hard-reset-conflict-");
    await git(root, ["switch", "-c", "conflicting"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "branch\n");
    await git(root, ["commit", "-am", "branch change"]);
    await git(root, ["switch", "main"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "main\n");
    await git(root, ["commit", "-am", "main change"]);
    await git(root, ["merge", "conflicting"]).catch(() => "");

    const commands: string[][] = [];
    const service = makeResetDepartmentService({ fs, git: makeTestGitCore({ commands }) });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
    expect(preview).toMatchObject({ operationState: "merge", conflicts: ["tracked.txt"] });

    const result = await Effect.runPromise(service.executeHardReset(resetInput(root, preview)));
    expect(result.snapshot).toMatchObject({ operationState: "none", conflicts: [] });
    expect(mutationCommands(commands)).toEqual([["reset", "--hard", "HEAD"]]);
  });

  it("blocks an unknown operation state without running reset", async () => {
    const root = await makeRepository("forkara-hard-reset-unknown-");
    const commands: string[][] = [];
    const unknownStateFs = {
      ...fs,
      access: async () => {
        throw Object.assign(new Error("operation state unavailable"), { code: "EACCES" });
      },
    };
    const service = makeResetDepartmentService({
      fs: unknownStateFs,
      git: makeTestGitCore({ commands }),
    });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
    expect(preview.operationState).toBe("unknown");

    await expect(
      Effect.runPromise(service.executeHardReset(resetInput(root, preview))),
    ).rejects.toMatchObject({ reason: "reset-blocked" });
    expect(mutationCommands(commands)).toEqual([]);
  });

  it("supports detached HEAD after exact confirmation", async () => {
    const root = await makeRepository("forkara-hard-reset-detached-");
    await git(root, ["switch", "--detach", "HEAD"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "detached change\n");
    const commands: string[][] = [];
    const service = makeResetDepartmentService({ fs, git: makeTestGitCore({ commands }) });
    const preview = await Effect.runPromise(service.inspectHardResetImpact({ cwd: root }));
    expect(preview).toMatchObject({ detached: true, branch: null });

    const result = await Effect.runPromise(service.executeHardReset(resetInput(root, preview)));
    expect(result.snapshot).toMatchObject({ detached: true, unstagedTracked: [] });
    expect(mutationCommands(commands)).toEqual([["reset", "--hard", "HEAD"]]);
  });
});
