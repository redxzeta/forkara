// FILE: gitForkArchaeology.ts
// Purpose: Bounded, factual Git provenance reads for fork and selected-file history.
// Layer: Server Git domain helper, executed exclusively through GitCore's command seam.

import type {
  GitForkArchaeologyCommit,
  GitForkArchaeologyCommitPageInput,
  GitForkArchaeologyCommitPageResult,
  GitForkArchaeologyFileHistoryInput,
  GitForkArchaeologyFileHistoryResult,
  GitForkArchaeologyOverviewResult,
  GitForkArchaeologyState,
  GitUpstreamStatusResult,
} from "@forkara/contracts";
import { Effect } from "effect";

import { GitCommandError } from "./Errors.ts";

const UPSTREAM_REMOTE_NAME = "upstream";
const COMMIT_FORMAT = "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1e";

interface ExecuteOptions {
  readonly allowNonZeroExit?: boolean;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

type Execute = (
  operation: string,
  cwd: string,
  args: readonly string[],
  options?: ExecuteOptions,
) => Effect.Effect<{ code: number; stdout: string; stderr: string }, GitCommandError>;

interface Relationship {
  readonly state: GitForkArchaeologyState;
  readonly message: string;
  readonly upstreamRef: string | null;
  readonly mergeBaseSha: string | null;
  readonly forkUniqueCount: number;
  readonly upstreamUniqueCount: number;
  readonly upstreamRepositoryUrl: string | null;
}

function archaeologyError(cwd: string, operation: string, detail: string) {
  return new GitCommandError({
    operation,
    command: "git fork-archaeology",
    cwd,
    detail,
  });
}

export function normalizeArchaeologyFilePath(path: string): string | null {
  const normalized = path.trim().replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }
  return normalized.replace(/^\.\//, "");
}

export function upstreamWebRepositoryUrl(remoteUrl: string): string | null {
  const value = remoteUrl.trim().replace(/\.git$/, "");
  const scp = /^git@github\.com:([^/]+\/[^/]+)$/.exec(value);
  if (scp?.[1]) return `https://github.com/${scp[1]}`;
  const ssh = /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+)$/.exec(value);
  if (ssh?.[1]) return `https://github.com/${ssh[1]}`;
  const https = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(value);
  return https?.[1] ? `https://github.com/${https[1]}` : null;
}

function parseCommits(
  stdout: string,
  origin: GitForkArchaeologyCommit["origin"],
  upstreamRepositoryUrl: string | null,
): GitForkArchaeologyCommit[] {
  return stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .flatMap((record) => {
      const [sha, shortSha, subject, authorName, authoredAt] = record.split("\x1f");
      if (!sha || !shortSha || !authoredAt) return [];
      const canLink = origin === "upstream" || origin === "shared";
      return [
        {
          sha,
          shortSha,
          subject: subject?.trim() || "(no subject)",
          authorName: authorName?.trim() || "Unknown author",
          authoredAt,
          origin,
          upstreamUrl:
            canLink && upstreamRepositoryUrl
              ? `${upstreamRepositoryUrl}/commit/${encodeURIComponent(sha)}`
              : null,
        },
      ];
    });
}

function parseCount(stdout: string): number {
  const value = Number.parseInt(stdout.trim(), 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function makeGitForkArchaeology(input: {
  readonly execute: Execute;
  readonly upstreamStatus: (cwd: string) => Effect.Effect<GitUpstreamStatusResult, GitCommandError>;
}) {
  const { execute, upstreamStatus } = input;

  const readRelationship = (
    cwd: string,
    includeCounts = true,
  ): Effect.Effect<Relationship, GitCommandError> =>
    Effect.gen(function* () {
      const upstream = yield* upstreamStatus(cwd);
      if (!upstream.hasUpstream || !upstream.upstreamBranch) {
        return {
          state: "missing_upstream",
          message: "Configure and refresh an upstream remote before inspecting provenance.",
          upstreamRef: null,
          mergeBaseSha: null,
          forkUniqueCount: 0,
          upstreamUniqueCount: 0,
          upstreamRepositoryUrl: null,
        };
      }

      const upstreamRef = `refs/remotes/${UPSTREAM_REMOTE_NAME}/${upstream.upstreamBranch}`;
      const [upstreamRefResult, localHead, shallow, remote] = yield* Effect.all(
        [
          execute(
            "GitCore.forkArchaeology.upstreamRef",
            cwd,
            ["show-ref", "--verify", "--quiet", upstreamRef],
            { allowNonZeroExit: true, timeoutMs: 5_000 },
          ),
          execute("GitCore.forkArchaeology.localHead", cwd, ["rev-parse", "--verify", "HEAD"], {
            allowNonZeroExit: true,
            timeoutMs: 5_000,
          }),
          execute(
            "GitCore.forkArchaeology.shallow",
            cwd,
            ["rev-parse", "--is-shallow-repository"],
            { allowNonZeroExit: true, timeoutMs: 5_000 },
          ),
          execute(
            "GitCore.forkArchaeology.remote",
            cwd,
            ["remote", "get-url", UPSTREAM_REMOTE_NAME],
            { allowNonZeroExit: true, timeoutMs: 5_000 },
          ),
        ],
        { concurrency: 4 },
      );
      if (upstreamRefResult.code !== 0 || localHead.code !== 0) {
        return {
          state: "incomplete_history",
          message:
            "The local HEAD or cached upstream branch is unavailable. Refresh upstream history and try again.",
          upstreamRef,
          mergeBaseSha: null,
          forkUniqueCount: 0,
          upstreamUniqueCount: 0,
          upstreamRepositoryUrl: upstreamWebRepositoryUrl(remote.stdout),
        };
      }

      const mergeBase = yield* execute(
        "GitCore.forkArchaeology.mergeBase",
        cwd,
        ["merge-base", "HEAD", upstreamRef],
        {
          allowNonZeroExit: true,
          timeoutMs: 10_000,
        },
      );
      const counts = includeCounts
        ? yield* Effect.all(
            [
              execute(
                "GitCore.forkArchaeology.forkCount",
                cwd,
                ["rev-list", "--count", "HEAD", "--not", upstreamRef],
                { timeoutMs: 10_000 },
              ),
              execute(
                "GitCore.forkArchaeology.upstreamCount",
                cwd,
                ["rev-list", "--count", upstreamRef, "--not", "HEAD"],
                { timeoutMs: 10_000 },
              ),
            ],
            { concurrency: 2 },
          )
        : null;
      const isShallow = shallow.code === 0 && shallow.stdout.trim() === "true";
      const mergeBaseSha = mergeBase.code === 0 ? mergeBase.stdout.trim() || null : null;
      const state: GitForkArchaeologyState = mergeBaseSha
        ? "ready"
        : isShallow || shallow.code !== 0 || mergeBase.code > 1
          ? "incomplete_history"
          : "unrelated_history";
      const message = mergeBaseSha
        ? "Git found a common ancestor and can establish exact commit provenance."
        : isShallow
          ? "This shallow clone does not contain enough history to establish a common ancestor."
          : state === "incomplete_history"
            ? "Git could not determine whether the local history is complete enough to establish a common ancestor."
            : "Git found no common ancestor. The histories may be unrelated or rewritten.";
      return {
        state,
        message,
        upstreamRef,
        mergeBaseSha,
        forkUniqueCount: counts ? parseCount(counts[0].stdout) : 0,
        upstreamUniqueCount: counts ? parseCount(counts[1].stdout) : 0,
        upstreamRepositoryUrl: upstreamWebRepositoryUrl(remote.stdout),
      };
    });

  const readOneCommit = (
    cwd: string,
    sha: string,
    origin: GitForkArchaeologyCommit["origin"],
    upstreamRepositoryUrl: string | null,
  ): Effect.Effect<GitForkArchaeologyCommit | null, GitCommandError> =>
    execute("GitCore.forkArchaeology.commit", cwd, ["show", "-s", COMMIT_FORMAT, sha], {
      timeoutMs: 5_000,
      maxOutputBytes: 64 * 1_024,
    }).pipe(
      Effect.map((result) => parseCommits(result.stdout, origin, upstreamRepositoryUrl)[0] ?? null),
    );

  const overview = (
    cwd: string,
  ): Effect.Effect<GitForkArchaeologyOverviewResult, GitCommandError> =>
    Effect.gen(function* () {
      const relationship = yield* readRelationship(cwd);
      const mergeBase = relationship.mergeBaseSha
        ? yield* readOneCommit(
            cwd,
            relationship.mergeBaseSha,
            "shared",
            relationship.upstreamRepositoryUrl,
          )
        : null;
      return {
        state: relationship.state,
        message: relationship.message,
        localRef: "HEAD",
        upstreamRef: relationship.upstreamRef,
        mergeBase,
        forkUniqueCount: relationship.forkUniqueCount,
        upstreamUniqueCount: relationship.upstreamUniqueCount,
        upstreamRepositoryUrl: relationship.upstreamRepositoryUrl,
      };
    });

  const commitPage = (
    request: GitForkArchaeologyCommitPageInput,
  ): Effect.Effect<GitForkArchaeologyCommitPageResult, GitCommandError> =>
    Effect.gen(function* () {
      const relationship = yield* readRelationship(request.cwd, false);
      if (!relationship.upstreamRef) return { commits: [], nextOffset: null };
      const positiveRef = request.side === "fork" ? "HEAD" : relationship.upstreamRef;
      const negativeRef = request.side === "fork" ? relationship.upstreamRef : "HEAD";
      const result = yield* execute(
        "GitCore.forkArchaeology.commitPage",
        request.cwd,
        [
          "log",
          `--max-count=${request.limit + 1}`,
          `--skip=${request.offset}`,
          COMMIT_FORMAT,
          positiveRef,
          "--not",
          negativeRef,
        ],
        { timeoutMs: 15_000, maxOutputBytes: 512 * 1_024 },
      );
      const parsed = parseCommits(result.stdout, request.side, relationship.upstreamRepositoryUrl);
      const commits = parsed.slice(0, request.limit);
      return {
        commits,
        nextOffset: parsed.length > request.limit ? request.offset + commits.length : null,
      };
    });

  const fileHistory = (
    request: GitForkArchaeologyFileHistoryInput,
  ): Effect.Effect<GitForkArchaeologyFileHistoryResult, GitCommandError> =>
    Effect.gen(function* () {
      const path = normalizeArchaeologyFilePath(request.path);
      if (!path) {
        return yield* archaeologyError(
          request.cwd,
          "GitCore.forkArchaeology.fileHistory",
          "Select a repository-relative file path without parent-directory traversal.",
        );
      }
      const relationship = yield* readRelationship(request.cwd, false);
      const result = yield* execute(
        "GitCore.forkArchaeology.fileHistory",
        request.cwd,
        [
          "log",
          "--follow",
          `--max-count=${request.limit + 1}`,
          `--skip=${request.offset}`,
          COMMIT_FORMAT,
          "HEAD",
          "--",
          path,
        ],
        { timeoutMs: 15_000, maxOutputBytes: 512 * 1_024 },
      );
      const unclassified = parseCommits(result.stdout, "unknown", null);
      const page = unclassified.slice(0, request.limit);
      const commits = yield* Effect.forEach(
        page,
        (commit) =>
          relationship.state !== "ready" || !relationship.upstreamRef
            ? Effect.succeed(commit)
            : execute(
                "GitCore.forkArchaeology.fileOrigin",
                request.cwd,
                ["merge-base", "--is-ancestor", commit.sha, relationship.upstreamRef],
                { allowNonZeroExit: true, timeoutMs: 5_000 },
              ).pipe(
                Effect.map((ancestry) => {
                  if (ancestry.code > 1) return commit;
                  const origin = ancestry.code === 0 ? "shared" : "fork";
                  return {
                    sha: commit.sha,
                    shortSha: commit.shortSha,
                    subject: commit.subject,
                    authorName: commit.authorName,
                    authoredAt: commit.authoredAt,
                    origin,
                    upstreamUrl:
                      origin === "shared" && relationship.upstreamRepositoryUrl
                        ? `${relationship.upstreamRepositoryUrl}/commit/${encodeURIComponent(commit.sha)}`
                        : null,
                  } satisfies GitForkArchaeologyCommit;
                }),
              ),
        { concurrency: 6 },
      );
      const available = commits.length > 0;
      return {
        state: available ? "available" : "unknown",
        message: available
          ? "History is reported from exact commit ancestry recorded by Git."
          : "Git has no recorded history for this path at the selected offset.",
        path,
        commits,
        nextOffset: unclassified.length > request.limit ? request.offset + commits.length : null,
      };
    });

  return { overview, commitPage, fileHistory } as const;
}
