// FILE: gitOriginalityMeter.ts
// Purpose: Deterministic parody score over factual fork-only tree changes.
// Layer: Server Git domain helper, executed exclusively through GitCore's command seam.

import type {
  GitForkArchaeologyOverviewResult,
  GitOriginalityMeterResult,
} from "@forkara/contracts";
import { Effect } from "effect";

import type { GitCommandError } from "./Errors.ts";

const MAX_GIT_OUTPUT_BYTES = 8 * 1_024 * 1_024;

export const ORIGINALITY_EXCLUSION_RULES = [
  "Dependency and vendor directories: node_modules, vendor, vendors",
  "Build and generated directories: build, dist, coverage, .next, .turbo, target, generated",
  "Common lockfiles, source maps, minified files, and filenames containing .generated.",
  "Files Git reports as binary in the fork-only diff",
] as const;

const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "target",
  "vendor",
  "vendors",
]);

const EXCLUDED_FILE_NAMES = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

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

interface NumstatEntry {
  readonly path: string;
  readonly previousPath: string | null;
  readonly insertions: number;
  readonly deletions: number;
  readonly binary: boolean;
}

function parseCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseOriginalityNumstat(stdout: string): NumstatEntry[] {
  const entries: NumstatEntry[] = [];
  const records = stdout.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (!record) continue;
    const firstTab = record.indexOf("\t");
    const secondTab = firstTab < 0 ? -1 : record.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;
    const insertionsRaw = record.slice(0, firstTab);
    const deletionsRaw = record.slice(firstTab + 1, secondTab);
    let path = record.slice(secondTab + 1);
    let previousPath: string | null = null;
    if (!path) {
      previousPath = records[index + 1] || null;
      path = records[index + 2] || "";
      index += 2;
    }
    if (!path) continue;
    const binary = insertionsRaw === "-" || deletionsRaw === "-";
    entries.push({
      path,
      previousPath,
      insertions: binary ? 0 : parseCount(insertionsRaw),
      deletions: binary ? 0 : parseCount(deletionsRaw),
      binary,
    });
  }
  return entries;
}

export function isOriginalityExcludedPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments.at(-1)?.toLowerCase() ?? "";
  return (
    segments.some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment.toLowerCase())) ||
    EXCLUDED_FILE_NAMES.has(fileName) ||
    fileName.endsWith(".map") ||
    fileName.endsWith(".min.js") ||
    fileName.endsWith(".min.css") ||
    fileName.includes(".generated.")
  );
}

function parseTreePaths(stdout: string): string[] {
  return stdout.split("\0").filter(Boolean);
}

export function calculateOriginality(input: {
  readonly basePaths: readonly string[];
  readonly headPaths: readonly string[];
  readonly entries: readonly NumstatEntry[];
}): Pick<
  GitOriginalityMeterResult,
  | "scorePercent"
  | "changedFileCount"
  | "comparableFileCount"
  | "insertions"
  | "deletions"
  | "binaryFileCount"
  | "excludedFileCount"
> {
  const comparablePaths = new Set([...input.basePaths, ...input.headPaths]);
  const excludedPaths = new Set(
    [...comparablePaths].filter((path) => isOriginalityExcludedPath(path)),
  );
  const changedPaths = new Set<string>();
  let insertions = 0;
  let deletions = 0;
  let binaryFileCount = 0;

  for (const entry of input.entries) {
    const pair = [entry.previousPath, entry.path].filter((path): path is string => Boolean(path));
    const excluded = entry.binary || pair.some((path) => isOriginalityExcludedPath(path));
    if (entry.binary) binaryFileCount += 1;
    if (excluded) {
      for (const path of pair) excludedPaths.add(path);
      continue;
    }
    if (entry.previousPath && entry.previousPath !== entry.path) {
      comparablePaths.delete(entry.previousPath);
    }
    changedPaths.add(entry.path);
    insertions += entry.insertions;
    deletions += entry.deletions;
  }

  for (const path of excludedPaths) comparablePaths.delete(path);
  const comparableFileCount = comparablePaths.size;
  const changedFileCount = [...changedPaths].filter((path) => comparablePaths.has(path)).length;
  const scorePercent =
    comparableFileCount === 0
      ? 0
      : Math.round((Math.min(changedFileCount, comparableFileCount) / comparableFileCount) * 100);
  return {
    scorePercent,
    changedFileCount,
    comparableFileCount,
    insertions,
    deletions,
    binaryFileCount,
    excludedFileCount: excludedPaths.size,
  };
}

function unavailableResult(overview: GitForkArchaeologyOverviewResult): GitOriginalityMeterResult {
  return {
    state: overview.state,
    message: overview.message,
    scorePercent: null,
    changedFileCount: 0,
    comparableFileCount: 0,
    insertions: 0,
    deletions: 0,
    binaryFileCount: 0,
    excludedFileCount: 0,
    forkUniqueCommitCount: overview.forkUniqueCount,
    upstreamUniqueCommitCount: overview.upstreamUniqueCount,
    calculationVersion: "changed_eligible_files_v1",
    exclusionRules: ORIGINALITY_EXCLUSION_RULES,
  };
}

export function makeGitOriginalityMeter(input: {
  readonly execute: Execute;
  readonly forkArchaeologyOverview: (
    cwd: string,
  ) => Effect.Effect<GitForkArchaeologyOverviewResult, GitCommandError>;
}) {
  const { execute, forkArchaeologyOverview } = input;

  const read = (cwd: string): Effect.Effect<GitOriginalityMeterResult, GitCommandError> =>
    Effect.gen(function* () {
      const overview = yield* forkArchaeologyOverview(cwd);
      const mergeBaseSha = overview.mergeBase?.sha ?? null;
      if (overview.state !== "ready" || !mergeBaseSha) return unavailableResult(overview);

      const [diff, baseTree, headTree] = yield* Effect.all(
        [
          execute(
            "GitCore.originalityMeter.diff",
            cwd,
            ["diff", "--numstat", "-z", "--find-renames", mergeBaseSha, "HEAD"],
            { timeoutMs: 15_000, maxOutputBytes: MAX_GIT_OUTPUT_BYTES },
          ),
          execute(
            "GitCore.originalityMeter.baseTree",
            cwd,
            ["ls-tree", "-r", "-z", "--name-only", mergeBaseSha],
            { timeoutMs: 15_000, maxOutputBytes: MAX_GIT_OUTPUT_BYTES },
          ),
          execute(
            "GitCore.originalityMeter.headTree",
            cwd,
            ["ls-tree", "-r", "-z", "--name-only", "HEAD"],
            { timeoutMs: 15_000, maxOutputBytes: MAX_GIT_OUTPUT_BYTES },
          ),
        ],
        { concurrency: 3 },
      );
      const calculation = calculateOriginality({
        basePaths: parseTreePaths(baseTree.stdout),
        headPaths: parseTreePaths(headTree.stdout),
        entries: parseOriginalityNumstat(diff.stdout),
      });
      return {
        state: "ready",
        message:
          "Score calculated from eligible files changed between the exact common ancestor and committed HEAD.",
        ...calculation,
        forkUniqueCommitCount: overview.forkUniqueCount,
        upstreamUniqueCommitCount: overview.upstreamUniqueCount,
        calculationVersion: "changed_eligible_files_v1",
        exclusionRules: ORIGINALITY_EXCLUSION_RULES,
      };
    });

  return { read } as const;
}
