// FILE: gitForkSpeedrun.ts
// Purpose: Bounded local derivation of factual fork milestone timestamps.
// Layer: Server Git domain helper, executed exclusively through GitCore's command seam.

import type {
  GitForkArchaeologyOverviewResult,
  GitForkSpeedrunEvent,
  GitForkSpeedrunResult,
} from "@forkara/contracts";
import { Effect } from "effect";

import type { GitCommandError } from "./Errors.ts";

const COMMIT_FORMAT = "--format=%H%x1f%h%x1f%cI%x1f%s%x1e";
const MAX_LOG_OUTPUT_BYTES = 1 * 1_024 * 1_024;

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

interface CommitReceipt {
  readonly sha: string;
  readonly shortSha: string;
  readonly committedAt: string;
  readonly subject: string;
}

function parseCommitReceipts(stdout: string): CommitReceipt[] {
  return stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .flatMap((record) => {
      const [sha, shortSha, committedAt, subject] = record.split("\x1f");
      if (!sha || !shortSha || !committedAt || !Number.isFinite(Date.parse(committedAt))) return [];
      return [{ sha, shortSha, committedAt, subject: subject?.trim() || "(no subject)" }];
    });
}

function firstReceiptAtOrAfter(receipts: readonly CommitReceipt[], startedAt: string) {
  const startedAtMs = Date.parse(startedAt);
  return (
    receipts
      .filter((receipt) => Date.parse(receipt.committedAt) >= startedAtMs)
      .reduce<CommitReceipt | null>((earliest, receipt) => {
        if (!earliest) return receipt;
        return Date.parse(receipt.committedAt) < Date.parse(earliest.committedAt)
          ? receipt
          : earliest;
      }, null) ?? null
  );
}

function elapsedSeconds(startedAt: string, occurredAt: string): number {
  return Math.max(0, Math.floor((Date.parse(occurredAt) - Date.parse(startedAt)) / 1_000));
}

function commitEvent(
  kind: "first_fork_commit" | "readme_changed",
  label: string,
  receipt: CommitReceipt,
  startedAt: string,
): GitForkSpeedrunEvent {
  return {
    kind,
    label,
    occurredAt: receipt.committedAt,
    elapsedSeconds: elapsedSeconds(startedAt, receipt.committedAt),
    commit: {
      sha: receipt.sha,
      shortSha: receipt.shortSha,
      subject: receipt.subject,
    },
  };
}

function unavailableResult(input: {
  overview: GitForkArchaeologyOverviewResult;
  startedAt: string;
}): GitForkSpeedrunResult {
  return {
    state: input.overview.state,
    message: input.overview.message,
    startedAt: input.startedAt,
    events: [
      {
        kind: "project_added",
        label: "Project added to Forkara",
        occurredAt: input.startedAt,
        elapsedSeconds: 0,
        commit: null,
      },
    ],
    missingEvents: ["first_fork_commit", "readme_changed"],
  };
}

export function makeGitForkSpeedrun(input: {
  readonly execute: Execute;
  readonly forkArchaeologyOverview: (
    cwd: string,
  ) => Effect.Effect<GitForkArchaeologyOverviewResult, GitCommandError>;
}) {
  const { execute, forkArchaeologyOverview } = input;

  const read = (request: {
    readonly cwd: string;
    readonly startedAt: string;
  }): Effect.Effect<GitForkSpeedrunResult, GitCommandError> =>
    Effect.gen(function* () {
      const overview = yield* forkArchaeologyOverview(request.cwd);
      const mergeBaseSha = overview.mergeBase?.sha ?? null;
      if (overview.state !== "ready" || !mergeBaseSha) {
        return unavailableResult({ overview, startedAt: request.startedAt });
      }

      const range = `${mergeBaseSha}..HEAD`;
      const [forkLog, readmeLog] = yield* Effect.all(
        [
          execute(
            "GitCore.forkSpeedrun.forkLog",
            request.cwd,
            ["log", "--reverse", COMMIT_FORMAT, range],
            { timeoutMs: 10_000, maxOutputBytes: MAX_LOG_OUTPUT_BYTES },
          ),
          execute(
            "GitCore.forkSpeedrun.readmeLog",
            request.cwd,
            [
              "log",
              "--reverse",
              COMMIT_FORMAT,
              range,
              "--",
              ":(icase,glob)README*",
              ":(icase,glob)**/README*",
            ],
            { timeoutMs: 10_000, maxOutputBytes: MAX_LOG_OUTPUT_BYTES },
          ),
        ],
        { concurrency: 2 },
      );
      const firstForkCommit = firstReceiptAtOrAfter(
        parseCommitReceipts(forkLog.stdout),
        request.startedAt,
      );
      const firstReadmeChange = firstReceiptAtOrAfter(
        parseCommitReceipts(readmeLog.stdout),
        request.startedAt,
      );
      const events: GitForkSpeedrunEvent[] = [
        {
          kind: "project_added",
          label: "Project added to Forkara",
          occurredAt: request.startedAt,
          elapsedSeconds: 0,
          commit: null,
        },
      ];
      if (firstForkCommit) {
        events.push(
          commitEvent(
            "first_fork_commit",
            "First fork-only commit",
            firstForkCommit,
            request.startedAt,
          ),
        );
      }
      if (firstReadmeChange) {
        events.push(
          commitEvent("readme_changed", "README changed", firstReadmeChange, request.startedAt),
        );
      }
      const sortedEvents = events.toSorted(
        (left, right) =>
          left.elapsedSeconds - right.elapsedSeconds || left.kind.localeCompare(right.kind),
      );
      const presentKinds = new Set(sortedEvents.map((event) => event.kind));
      return {
        state: "ready",
        message:
          "Local milestones derived from the project creation receipt and exact fork-only Git history.",
        startedAt: request.startedAt,
        events: sortedEvents,
        missingEvents: (["first_fork_commit", "readme_changed"] as const).filter(
          (kind) => !presentKinds.has(kind),
        ),
      };
    });

  return { read } as const;
}
