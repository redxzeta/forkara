// FILE: gitForkFamilyTree.ts
// Purpose: Bounded direct fork ancestry from local remotes plus one optional GitHub metadata read.
// Layer: Server Git domain helper composed by GitManager.

import type {
  GitForkFamilyTreeEdge,
  GitForkFamilyTreeNode,
  GitForkFamilyTreeResult,
  GitUpstreamStatusResult,
} from "@forkara/contracts";
import { Effect, Result, Schema } from "effect";
import { parseGitHubRepositoryNameWithOwnerFromRemoteUrl } from "@forkara/shared/githubRepository";
import { decodeJsonResult } from "@forkara/shared/schemaJson";

import type { GitCommandError } from "./Errors.ts";

const GitHubRepositorySchema = Schema.Struct({
  nameWithOwner: Schema.String,
  url: Schema.String,
  isFork: Schema.Boolean,
  pushedAt: Schema.NullOr(Schema.String),
  defaultBranchRef: Schema.NullOr(Schema.Struct({ name: Schema.String })),
  parent: Schema.NullOr(
    Schema.Struct({
      nameWithOwner: Schema.String,
      url: Schema.String,
      pushedAt: Schema.NullOr(Schema.String),
      defaultBranchRef: Schema.NullOr(Schema.Struct({ name: Schema.String })),
    }),
  ),
});
type GitHubRepository = typeof GitHubRepositorySchema.Type;
const decodeGitHubRepository = decodeJsonResult(GitHubRepositorySchema);

type ExecuteGit = (input: {
  readonly operation: string;
  readonly cwd: string;
  readonly args: ReadonlyArray<string>;
  readonly allowNonZeroExit?: boolean;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}) => Effect.Effect<{ code: number; stdout: string; stderr: string }, GitCommandError>;

type ExecuteGitHub = (input: {
  readonly cwd: string;
  readonly args: ReadonlyArray<string>;
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
}) => Effect.Effect<{ stdout: string }, unknown>;

function validIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

export function sanitizeRepositoryRemote(remoteUrl: string | null): {
  name: string | null;
  repositoryUrl: string | null;
} {
  if (!remoteUrl) return { name: null, repositoryUrl: null };
  const githubName = parseGitHubRepositoryNameWithOwnerFromRemoteUrl(remoteUrl);
  if (githubName) {
    return { name: githubName, repositoryUrl: `https://github.com/${githubName}` };
  }
  try {
    const parsed = new URL(remoteUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { name: null, repositoryUrl: null };
    }
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\.git$/, "").replace(/\/$/, "");
    const segments = parsed.pathname.split("/").filter(Boolean);
    return {
      name: segments.slice(-2).join("/") || parsed.hostname,
      repositoryUrl: parsed.toString().replace(/\/$/, ""),
    };
  } catch {
    return { name: null, repositoryUrl: null };
  }
}

function cwdName(cwd: string): string {
  const normalized = cwd.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || "Current repository";
}

function parseGitHubMetadata(stdout: string): GitHubRepository | null {
  const decoded = decodeGitHubRepository(stdout);
  return Result.isSuccess(decoded) ? decoded.success : null;
}

export function makeGitForkFamilyTree(input: {
  readonly executeGit: ExecuteGit;
  readonly readConfigValue: (
    cwd: string,
    key: string,
  ) => Effect.Effect<string | null, GitCommandError>;
  readonly upstreamStatus: (cwd: string) => Effect.Effect<GitUpstreamStatusResult, GitCommandError>;
  readonly executeGitHub: ExecuteGitHub;
}) {
  const { executeGit, executeGitHub, readConfigValue, upstreamStatus } = input;

  const readActivity = (cwd: string, ref: string) =>
    executeGit({
      operation: "GitManager.forkFamilyTree.activity",
      cwd,
      args: ["log", "-1", "--format=%aI", ref],
      allowNonZeroExit: true,
      timeoutMs: 5_000,
      maxOutputBytes: 16 * 1_024,
    }).pipe(
      Effect.map((result) => (result.code === 0 ? validIsoDate(result.stdout.trim()) : null)),
    );

  const readGitHub = (cwd: string) =>
    executeGitHub({
      cwd,
      args: [
        "repo",
        "view",
        "--json",
        "nameWithOwner,url,isFork,pushedAt,defaultBranchRef,parent",
        "--jq",
        '{nameWithOwner,url,isFork,pushedAt,defaultBranchRef,parent:(if .parent then {nameWithOwner:(.parent.owner.login + "/" + .parent.name),url:("https://github.com/" + .parent.owner.login + "/" + .parent.name),pushedAt:null,defaultBranchRef:null} else null end)}',
      ],
      timeoutMs: 8_000,
      maxBufferBytes: 256 * 1_024,
    }).pipe(
      Effect.map((result) => parseGitHubMetadata(result.stdout)),
      Effect.catchCause(() => Effect.succeed(null)),
    );

  const read = (cwd: string): Effect.Effect<GitForkFamilyTreeResult, GitCommandError> =>
    Effect.gen(function* () {
      const [upstream, originUrl, upstreamUrl, github, localActivity] = yield* Effect.all(
        [
          upstreamStatus(cwd),
          readConfigValue(cwd, "remote.origin.url"),
          readConfigValue(cwd, "remote.upstream.url"),
          readGitHub(cwd),
          readActivity(cwd, "HEAD"),
        ],
        { concurrency: 5 },
      );
      const origin = sanitizeRepositoryRemote(originUrl);
      const configuredUpstream = sanitizeRepositoryRemote(upstreamUrl);
      const upstreamRef =
        upstream.hasUpstream && upstream.upstreamBranch
          ? `refs/remotes/upstream/${upstream.upstreamBranch}`
          : null;
      const upstreamActivity = upstreamRef ? yield* readActivity(cwd, upstreamRef) : null;

      const currentNode: GitForkFamilyTreeNode = {
        id: "current",
        role: "current",
        name: github?.nameWithOwner || origin.name || cwdName(cwd),
        repositoryUrl: github?.url || origin.repositoryUrl,
        remoteName: originUrl ? "origin" : null,
        defaultBranch: github?.defaultBranchRef?.name ?? null,
        aheadCount: upstream.hasUpstream ? upstream.aheadCount : null,
        behindCount: upstream.hasUpstream ? upstream.behindCount : null,
        lastActivityAt: localActivity ?? validIsoDate(github?.pushedAt),
      };
      const nodes: GitForkFamilyTreeNode[] = [currentNode];
      const edges: GitForkFamilyTreeEdge[] = [];

      if (upstream.hasUpstream || configuredUpstream.name) {
        nodes.push({
          id: "upstream",
          role: "upstream",
          name: configuredUpstream.name || "Configured upstream",
          repositoryUrl: configuredUpstream.repositoryUrl,
          remoteName: "upstream",
          defaultBranch: upstream.upstreamBranch,
          aheadCount: upstream.hasUpstream ? upstream.behindCount : null,
          behindCount: upstream.hasUpstream ? upstream.aheadCount : null,
          lastActivityAt: upstreamActivity,
        });
        edges.push({ from: "upstream", to: "current", relationship: "configured_upstream" });
      }

      const parent = github?.parent ?? null;
      if (parent) {
        const upstreamNode = nodes.find((node) => node.id === "upstream");
        if (
          upstreamNode &&
          upstreamNode.name.toLowerCase() === parent.nameWithOwner.toLowerCase()
        ) {
          const index = nodes.indexOf(upstreamNode);
          nodes[index] = {
            ...upstreamNode,
            name: parent.nameWithOwner,
            repositoryUrl: parent.url,
            defaultBranch: parent.defaultBranchRef?.name ?? upstreamNode.defaultBranch,
            lastActivityAt: upstreamNode.lastActivityAt ?? validIsoDate(parent.pushedAt),
          };
        } else {
          nodes.push({
            id: "github-parent",
            role: "github_parent",
            name: parent.nameWithOwner,
            repositoryUrl: parent.url,
            remoteName: null,
            defaultBranch: parent.defaultBranchRef?.name ?? null,
            aheadCount: null,
            behindCount: null,
            lastActivityAt: validIsoDate(parent.pushedAt),
          });
          edges.push({ from: "github-parent", to: "current", relationship: "github_parent" });
        }
      }

      const metadataState =
        github && (!github.isFork || parent)
          ? "complete"
          : github || nodes.length > 1
            ? "partial"
            : "local_only";
      const hasAncestor = nodes.length > 1;
      return {
        metadataState,
        message: hasAncestor
          ? github
            ? "Ancestry detected. This does not necessarily mean you're related. (It does.)"
            : "Direct ancestry is shown from local remotes. GitHub metadata is unavailable."
          : github
            ? "GitHub reports no direct parent, and no configured upstream remote was found."
            : "No direct ancestry is known locally. GitHub metadata is unavailable.",
        nodes,
        edges,
      };
    });

  return { read } as const;
}
