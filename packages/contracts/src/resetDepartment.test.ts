import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  DependencyCleanupPreview,
  DependencyCleanupResult,
  HardResetImpactSnapshot,
  HardResetStashInput,
  HardResetStashResult,
} from "./resetDepartment";

describe("Reset Department contracts", () => {
  it("decodes exact dependency cleanup previews and results", () => {
    const preview = {
      workspaceRoot: "/workspace",
      targetPath: "/workspace/node_modules",
      state: "ready",
      packageManager: "bun",
      installCommand: "bun install",
    } as const;

    expect(Schema.decodeUnknownSync(DependencyCleanupPreview)(preview)).toEqual(preview);
    expect(
      Schema.decodeUnknownSync(DependencyCleanupResult)({ ...preview, removed: true }),
    ).toEqual({ ...preview, removed: true });
  });

  it("decodes factual hard-reset impact snapshots without filling unknown data", () => {
    const snapshot = {
      repositoryState: "ready",
      workspaceRoot: "/workspace",
      repositoryRoot: "/workspace",
      repositoryIdentity: "a".repeat(64),
      branch: null,
      detached: true,
      head: "0123456789abcdef",
      stagedTracked: ["staged.txt"],
      unstagedTracked: ["dirty.txt"],
      untracked: ["untracked.txt"],
      conflicts: [],
      operationState: "none",
      fingerprint: "b".repeat(64),
    } as const;

    expect(Schema.decodeUnknownSync(HardResetImpactSnapshot)(snapshot)).toEqual(snapshot);
    expect(
      Schema.decodeUnknownSync(HardResetImpactSnapshot)({
        ...snapshot,
        repositoryState: "not-repository",
        repositoryRoot: null,
        repositoryIdentity: null,
        detached: null,
        head: null,
        stagedTracked: null,
        unstagedTracked: null,
        untracked: null,
        conflicts: null,
        operationState: "unknown",
        fingerprint: null,
      }),
    ).toMatchObject({ repositoryState: "not-repository", stagedTracked: null });
  });

  it("preserves valid Git paths with leading or trailing whitespace", () => {
    const snapshot = {
      repositoryState: "ready",
      workspaceRoot: "/workspace",
      repositoryRoot: "/workspace",
      repositoryIdentity: "a".repeat(64),
      branch: "main",
      detached: false,
      head: "0123456789abcdef",
      stagedTracked: [" leading.txt"],
      unstagedTracked: ["trailing.txt "],
      untracked: [],
      conflicts: [],
      operationState: "none",
      fingerprint: "b".repeat(64),
    } as const;

    expect(Schema.decodeUnknownSync(HardResetImpactSnapshot)(snapshot)).toEqual(snapshot);
  });

  it("decodes hard-reset stash guards and refreshed results", () => {
    const input = {
      cwd: "/workspace",
      expectedRepositoryIdentity: "a".repeat(64),
      expectedHead: "0123456789abcdef",
      expectedFingerprint: "b".repeat(64),
    };
    const snapshot = {
      repositoryState: "ready",
      workspaceRoot: "/workspace",
      repositoryRoot: "/workspace",
      repositoryIdentity: input.expectedRepositoryIdentity,
      branch: "main",
      detached: false,
      head: input.expectedHead,
      stagedTracked: [],
      unstagedTracked: [],
      untracked: [],
      conflicts: [],
      operationState: "none",
      fingerprint: "c".repeat(64),
    } as const;

    expect(Schema.decodeUnknownSync(HardResetStashInput)(input)).toEqual(input);
    expect(
      Schema.decodeUnknownSync(HardResetStashResult)({
        status: "stashed",
        snapshot,
      }),
    ).toEqual({ status: "stashed", snapshot });
  });
});
