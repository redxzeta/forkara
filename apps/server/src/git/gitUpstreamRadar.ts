// FILE: gitUpstreamRadar.ts
// Purpose: Local fork/upstream divergence reads plus the explicit atomic upstream refresh.
// Layer: Server Git domain helper, executed exclusively through GitCore's command seam.

import type { GitUpstreamStatusResult } from "@forkara/contracts";
import { Duration, Effect, Result, Schema } from "effect";
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import { decodeJsonResult } from "@forkara/shared/schemaJson";

import { GitCommandError } from "./Errors.ts";

const UPSTREAM_REMOTE_NAME = "upstream";
const METADATA_FILENAME = "forkara-upstream-radar.json";
const STALE_AFTER_MS = Duration.toMillis(Duration.minutes(15));

const MetadataSchema = Schema.Struct({
  version: Schema.Literal(1),
  localBranch: Schema.String,
  upstreamBranch: Schema.String,
  fetchedAt: Schema.String,
});
type Metadata = typeof MetadataSchema.Type;
const decodeMetadata = decodeJsonResult(MetadataSchema);
const encodeMetadata = Schema.encodeSync(Schema.fromJsonString(MetadataSchema));

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

function radarError(cwd: string, operation: string, detail: string, cause?: unknown) {
  return new GitCommandError({
    operation,
    command: "git upstream-radar",
    cwd,
    detail,
    ...(cause !== undefined ? { cause } : {}),
  });
}

function parseRemoteHeadBranch(value: string): string | null {
  for (const line of value.split(/\r?\n/)) {
    const match = /^ref:\s+refs\/heads\/(.+?)\s+HEAD$/.exec(line.trim());
    if (match?.[1]) return match[1];
  }
  return null;
}

function statusMessage(input: {
  state: GitUpstreamStatusResult["state"];
  aheadCount: number;
  behindCount: number;
}): string {
  if (input.state === "unreachable") {
    return "Upstream could not be reached. Cached divergence is unchanged.";
  }
  if (input.state === "stale") {
    return "Upstream data is stale. Refresh to confirm the current relationship.";
  }
  if (input.aheadCount > 0 && input.behindCount > 0) {
    return `Fork has diverged: ${input.aheadCount} ahead and ${input.behindCount} behind upstream.`;
  }
  if (input.behindCount > 0) {
    return `Fork is ${input.behindCount} commit${input.behindCount === 1 ? "" : "s"} behind upstream.`;
  }
  if (input.aheadCount > 0) {
    return `Fork is ${input.aheadCount} commit${input.aheadCount === 1 ? "" : "s"} ahead of upstream.`;
  }
  return "Fork is up to date with upstream.";
}

export function makeGitUpstreamRadar(input: {
  readonly execute: Execute;
  readonly resolveDefaultBranchName: (
    cwd: string,
    remoteName: string,
  ) => Effect.Effect<string | null, GitCommandError>;
}) {
  const { execute, resolveDefaultBranchName } = input;
  const refExists = (cwd: string, ref: string) =>
    execute("GitCore.upstreamRadar.refExists", cwd, ["show-ref", "--verify", "--quiet", ref], {
      allowNonZeroExit: true,
      timeoutMs: 5_000,
    }).pipe(Effect.map((result) => result.code === 0));

  const resolveMetadataPath = (cwd: string) =>
    execute("GitCore.upstreamRadar.commonDir", cwd, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]).pipe(
      Effect.map((result) => result.stdout.trim()),
      Effect.map((commonDir) => nodePath.join(nodePath.resolve(cwd, commonDir), METADATA_FILENAME)),
    );

  const readMetadata = (cwd: string): Effect.Effect<Metadata | null, GitCommandError> =>
    Effect.gen(function* () {
      const metadataPath = yield* resolveMetadataPath(cwd);
      return yield* Effect.tryPromise(() => nodeFs.readFile(metadataPath, "utf8")).pipe(
        Effect.map((contents) => {
          const parsed = decodeMetadata(contents);
          if (Result.isFailure(parsed)) return null;
          const metadata = parsed.success;
          return metadata.localBranch.trim().length > 0 &&
            metadata.upstreamBranch.trim().length > 0 &&
            Number.isFinite(Date.parse(metadata.fetchedAt))
            ? metadata
            : null;
        }),
        Effect.catch(() => Effect.succeed(null)),
      );
    });

  const writeMetadata = (cwd: string, metadata: Metadata) =>
    Effect.gen(function* () {
      const metadataPath = yield* resolveMetadataPath(cwd);
      const temporaryPath = `${metadataPath}.${randomUUID()}.tmp`;
      yield* Effect.tryPromise({
        try: async () => {
          await nodeFs.writeFile(temporaryPath, `${encodeMetadata(metadata)}\n`, {
            encoding: "utf8",
            mode: 0o600,
          });
          await nodeFs.rename(temporaryPath, metadataPath);
        },
        catch: (cause) =>
          radarError(
            cwd,
            "GitCore.upstreamRadar.writeMetadata",
            "Could not record the successful upstream fetch.",
            cause,
          ),
      }).pipe(
        Effect.ensuring(Effect.tryPromise(() => nodeFs.unlink(temporaryPath)).pipe(Effect.ignore)),
      );
    });

  const resolveLocalDefaultBranch = (cwd: string, metadata: Metadata | null) =>
    Effect.gen(function* () {
      if (metadata && (yield* refExists(cwd, `refs/heads/${metadata.localBranch}`))) {
        return metadata.localBranch;
      }
      const originDefault = yield* resolveDefaultBranchName(cwd, "origin");
      if (originDefault) return originDefault;
      const current = yield* execute(
        "GitCore.upstreamRadar.currentBranch",
        cwd,
        ["branch", "--show-current"],
        { allowNonZeroExit: true, timeoutMs: 5_000 },
      );
      const branch = current.stdout.trim();
      return branch.length > 0 ? branch : null;
    });

  const resolveComparableLocalRef = (cwd: string, branch: string) =>
    Effect.gen(function* () {
      const localRef = `refs/heads/${branch}`;
      if (yield* refExists(cwd, localRef)) return localRef;
      const originRef = `refs/remotes/origin/${branch}`;
      return (yield* refExists(cwd, originRef)) ? originRef : null;
    });

  const readStatus = (
    cwd: string,
    forceState?: "unreachable",
  ): Effect.Effect<GitUpstreamStatusResult, GitCommandError> =>
    Effect.gen(function* () {
      const checkedAt = new Date().toISOString();
      const upstreamRemote = yield* execute(
        "GitCore.upstreamRadar.remote",
        cwd,
        ["remote", "get-url", UPSTREAM_REMOTE_NAME],
        { allowNonZeroExit: true, timeoutMs: 5_000 },
      );
      if (upstreamRemote.code !== 0 || upstreamRemote.stdout.trim().length === 0) {
        return {
          state: "missing",
          hasUpstream: false,
          localBranch: null,
          upstreamBranch: null,
          aheadCount: 0,
          behindCount: 0,
          lastSuccessfulFetchAt: null,
          checkedAt,
          message: "No upstream remote is configured for this repository.",
        };
      }

      const metadata = yield* readMetadata(cwd);
      const localBranch = yield* resolveLocalDefaultBranch(cwd, metadata);
      const symbolicUpstreamBranch = yield* resolveDefaultBranchName(cwd, UPSTREAM_REMOTE_NAME);
      const upstreamBranch = metadata?.upstreamBranch ?? symbolicUpstreamBranch ?? localBranch;
      const localRef = localBranch ? yield* resolveComparableLocalRef(cwd, localBranch) : null;
      const upstreamRef = upstreamBranch
        ? `refs/remotes/${UPSTREAM_REMOTE_NAME}/${upstreamBranch}`
        : null;
      const hasUpstreamRef = upstreamRef ? yield* refExists(cwd, upstreamRef) : false;

      let aheadCount = 0;
      let behindCount = 0;
      let countsAvailable = false;
      if (localRef && upstreamRef && hasUpstreamRef) {
        const counts = yield* execute(
          "GitCore.upstreamRadar.count",
          cwd,
          ["rev-list", "--left-right", "--count", `${localRef}...${upstreamRef}`],
          { allowNonZeroExit: true, timeoutMs: 10_000 },
        );
        if (counts.code === 0) {
          const [aheadRaw = "0", behindRaw = "0"] = counts.stdout.trim().split(/\s+/);
          aheadCount = Number.parseInt(aheadRaw, 10) || 0;
          behindCount = Number.parseInt(behindRaw, 10) || 0;
          countsAvailable = true;
        }
      }

      const fetchedAtMs = metadata ? Date.parse(metadata.fetchedAt) : Number.NaN;
      const fresh =
        metadata !== null &&
        metadata.localBranch === localBranch &&
        metadata.upstreamBranch === upstreamBranch &&
        localRef !== null &&
        hasUpstreamRef &&
        countsAvailable &&
        Date.now() - fetchedAtMs <= STALE_AFTER_MS;
      const state = forceState ?? (fresh ? "ready" : "stale");
      return {
        state,
        hasUpstream: true,
        localBranch,
        upstreamBranch,
        aheadCount,
        behindCount,
        lastSuccessfulFetchAt: metadata?.fetchedAt ?? null,
        checkedAt,
        message: statusMessage({ state, aheadCount, behindCount }),
      };
    });

  const refresh = (cwd: string): Effect.Effect<GitUpstreamStatusResult, GitCommandError> =>
    Effect.gen(function* () {
      const cached = yield* readStatus(cwd);
      if (!cached.hasUpstream) return cached;
      const metadata = yield* readMetadata(cwd);
      const localBranch = yield* resolveLocalDefaultBranch(cwd, metadata);
      if (!localBranch) {
        return yield* radarError(
          cwd,
          "GitCore.upstreamRadar.resolveLocalBranch",
          "The fork's local default branch could not be determined.",
        );
      }

      const networkResult = yield* Effect.result(
        Effect.gen(function* () {
          const remoteHead = yield* execute(
            "GitCore.upstreamRadar.resolveRemoteHead",
            cwd,
            ["ls-remote", "--symref", UPSTREAM_REMOTE_NAME, "HEAD"],
            { timeoutMs: 30_000, maxOutputBytes: 64 * 1_024 },
          );
          const upstreamBranch = parseRemoteHeadBranch(remoteHead.stdout);
          if (!upstreamBranch) {
            return yield* radarError(
              cwd,
              "GitCore.upstreamRadar.resolveRemoteHead",
              "The upstream default branch could not be determined.",
            );
          }
          const upstreamRef = `${UPSTREAM_REMOTE_NAME}/${upstreamBranch}`;
          const refspec = `+refs/heads/${upstreamBranch}:refs/remotes/${upstreamRef}`;
          yield* execute(
            "GitCore.upstreamRadar.fetch",
            cwd,
            ["fetch", "--atomic", "--quiet", "--no-tags", UPSTREAM_REMOTE_NAME, refspec],
            { timeoutMs: 60_000, maxOutputBytes: 64 * 1_024 },
          );
          return upstreamBranch;
        }),
      );
      if (Result.isFailure(networkResult)) return yield* readStatus(cwd, "unreachable");

      yield* writeMetadata(cwd, {
        version: 1,
        localBranch,
        upstreamBranch: networkResult.success,
        fetchedAt: new Date().toISOString(),
      });
      return yield* readStatus(cwd);
    });

  return { status: readStatus, refresh } as const;
}
