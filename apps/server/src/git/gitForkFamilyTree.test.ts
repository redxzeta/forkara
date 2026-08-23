import type { GitUpstreamStatusResult } from "@forkara/contracts";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { makeGitForkFamilyTree, sanitizeRepositoryRemote } from "./gitForkFamilyTree.ts";

function upstream(overrides: Partial<GitUpstreamStatusResult> = {}): GitUpstreamStatusResult {
  return {
    state: "ready",
    hasUpstream: true,
    localBranch: "built-from-scratch",
    upstreamBranch: "main",
    aheadCount: 4,
    behindCount: 2,
    lastSuccessfulFetchAt: "2026-08-23T12:00:00.000Z",
    checkedAt: "2026-08-23T12:01:00.000Z",
    message: "Fork has diverged.",
    ...overrides,
  };
}

function makeService(input?: {
  upstream?: GitUpstreamStatusResult;
  originUrl?: string | null;
  upstreamUrl?: string | null;
  githubJson?: string;
}) {
  const gitHubCalls: ReadonlyArray<string>[] = [];
  const executeGitHub = vi.fn(({ args }: { args: ReadonlyArray<string> }) => {
    gitHubCalls.push(args);
    return input?.githubJson
      ? Effect.succeed({ stdout: input.githubJson })
      : Effect.fail(new Error("GitHub unavailable"));
  });
  const executeGit = vi.fn(({ args }: { args: ReadonlyArray<string> }) =>
    Effect.succeed({
      code: 0,
      stdout: args.at(-1) === "HEAD" ? "2026-08-23T10:00:00Z\n" : "2026-08-22T09:00:00Z\n",
      stderr: "",
    }),
  );
  const service = makeGitForkFamilyTree({
    executeGit,
    upstreamStatus: () =>
      Effect.succeed(
        input?.upstream ??
          upstream({
            state: "missing",
            hasUpstream: false,
            upstreamBranch: null,
            aheadCount: 0,
            behindCount: 0,
            lastSuccessfulFetchAt: null,
          }),
      ),
    readConfigValue: (_cwd, key) =>
      Effect.succeed(
        key.includes("origin") ? (input?.originUrl ?? null) : (input?.upstreamUrl ?? null),
      ),
    executeGitHub,
  });
  return { service, executeGit, executeGitHub, gitHubCalls };
}

describe("sanitizeRepositoryRemote", () => {
  it("normalizes GitHub remotes and strips HTTP credentials", () => {
    expect(sanitizeRepositoryRemote("git@github.com:owner/repo.git")).toEqual({
      name: "owner/repo",
      repositoryUrl: "https://github.com/owner/repo",
    });
    expect(sanitizeRepositoryRemote("https://user:secret@example.com/team/repo.git")).toEqual({
      name: "team/repo",
      repositoryUrl: "https://example.com/team/repo",
    });
  });
});

describe("makeGitForkFamilyTree", () => {
  it("returns a local-only current node when no parent is known", async () => {
    const { service, executeGitHub } = makeService();

    const result = await Effect.runPromise(service.read("/work/example"));

    expect(result).toMatchObject({
      metadataState: "local_only",
      nodes: [{ id: "current", role: "current", name: "example" }],
      edges: [],
    });
    expect(executeGitHub).toHaveBeenCalledOnce();
  });

  it("deduplicates one configured upstream with the direct GitHub parent", async () => {
    const githubJson = JSON.stringify({
      nameWithOwner: "fork-owner/project",
      url: "https://github.com/fork-owner/project",
      isFork: true,
      pushedAt: "2026-08-23T08:00:00Z",
      defaultBranchRef: { name: "built-from-scratch" },
      parent: {
        nameWithOwner: "upstream-owner/project",
        url: "https://github.com/upstream-owner/project",
        pushedAt: "2026-08-22T08:00:00Z",
        defaultBranchRef: { name: "main" },
      },
    });
    const { service, executeGitHub, gitHubCalls } = makeService({
      upstream: upstream(),
      originUrl: "git@github.com:fork-owner/project.git",
      upstreamUrl: "git@github.com:upstream-owner/project.git",
      githubJson,
    });

    const result = await Effect.runPromise(service.read("/repo"));

    expect(result.metadataState).toBe("complete");
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "current",
          name: "fork-owner/project",
          aheadCount: 4,
          behindCount: 2,
        }),
        expect.objectContaining({
          id: "upstream",
          name: "upstream-owner/project",
          defaultBranch: "main",
          aheadCount: 2,
          behindCount: 4,
        }),
      ]),
    );
    expect(result.edges).toEqual([
      { from: "upstream", to: "current", relationship: "configured_upstream" },
    ]);
    expect(result.message).toContain("Ancestry detected");
    expect(executeGitHub).toHaveBeenCalledOnce();
    expect(gitHubCalls[0]).toEqual([
      "repo",
      "view",
      "--json",
      "nameWithOwner,url,isFork,pushedAt,defaultBranchRef,parent",
      "--jq",
      '{nameWithOwner,url,isFork,pushedAt,defaultBranchRef,parent:(if .parent then {nameWithOwner:(.parent.owner.login + "/" + .parent.name),url:("https://github.com/" + .parent.owner.login + "/" + .parent.name),pushedAt:null,defaultBranchRef:null} else null end)}',
    ]);
  });

  it("keeps direct local ancestry when GitHub metadata is unavailable", async () => {
    const { service, executeGitHub } = makeService({
      upstream: upstream(),
      originUrl: "git@example.com:fork/project.git",
      upstreamUrl: "https://example.com/source/project.git",
    });

    const result = await Effect.runPromise(service.read("/repo"));

    expect(result).toMatchObject({ metadataState: "partial" });
    expect(result.nodes.map((node) => node.id)).toEqual(["current", "upstream"]);
    expect(result.nodes[1]).toMatchObject({
      name: "source/project",
      remoteName: "upstream",
      defaultBranch: "main",
    });
    expect(result.message).toContain("local remotes");
    expect(executeGitHub).toHaveBeenCalledOnce();
  });
});
