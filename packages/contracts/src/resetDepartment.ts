import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas";

export const DependencyPackageManager = Schema.Literals(["bun", "pnpm", "yarn", "npm"]);
export type DependencyPackageManager = typeof DependencyPackageManager.Type;

export const DependencyCleanupInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type DependencyCleanupInput = typeof DependencyCleanupInput.Type;

export const DependencyCleanupPreview = Schema.Struct({
  workspaceRoot: TrimmedNonEmptyString,
  targetPath: TrimmedNonEmptyString,
  state: Schema.Literals(["ready", "missing"]),
  packageManager: Schema.NullOr(DependencyPackageManager),
  installCommand: Schema.NullOr(TrimmedNonEmptyString),
});
export type DependencyCleanupPreview = typeof DependencyCleanupPreview.Type;

export const DependencyCleanupResult = Schema.Struct({
  ...DependencyCleanupPreview.fields,
  removed: Schema.Boolean,
});
export type DependencyCleanupResult = typeof DependencyCleanupResult.Type;

const Sha256Hex = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));
const GitPath = Schema.NonEmptyString;

export const HardResetImpactInput = DependencyCleanupInput;
export type HardResetImpactInput = typeof HardResetImpactInput.Type;

export const HardResetOperationState = Schema.Literals(["none", "merge", "rebase", "unknown"]);
export type HardResetOperationState = typeof HardResetOperationState.Type;

export const HardResetImpactSnapshot = Schema.Struct({
  repositoryState: Schema.Literals(["ready", "not-repository"]),
  workspaceRoot: TrimmedNonEmptyString,
  repositoryRoot: Schema.NullOr(TrimmedNonEmptyString),
  repositoryIdentity: Schema.NullOr(Sha256Hex),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  detached: Schema.NullOr(Schema.Boolean),
  head: Schema.NullOr(TrimmedNonEmptyString),
  stagedTracked: Schema.NullOr(Schema.Array(GitPath)),
  unstagedTracked: Schema.NullOr(Schema.Array(GitPath)),
  untracked: Schema.NullOr(Schema.Array(GitPath)),
  conflicts: Schema.NullOr(Schema.Array(GitPath)),
  operationState: HardResetOperationState,
  fingerprint: Schema.NullOr(Sha256Hex),
});
export type HardResetImpactSnapshot = typeof HardResetImpactSnapshot.Type;

export const HardResetStashInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  expectedRepositoryIdentity: Sha256Hex,
  expectedHead: TrimmedNonEmptyString,
  expectedFingerprint: Sha256Hex,
});
export type HardResetStashInput = typeof HardResetStashInput.Type;

export const HardResetStashResult = Schema.Struct({
  status: Schema.Literals(["stashed", "nothing-to-stash"]),
  snapshot: HardResetImpactSnapshot,
});
export type HardResetStashResult = typeof HardResetStashResult.Type;

export const HardResetConfirmationInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  expectedRepositoryIdentity: Sha256Hex,
  expectedHead: TrimmedNonEmptyString,
  expectedFingerprint: Sha256Hex,
  confirmation: Schema.Literal("git has receipts"),
});
export type HardResetConfirmationInput = typeof HardResetConfirmationInput.Type;

export const HardResetResult = Schema.Struct({
  status: Schema.Literal("reset-completed"),
  snapshot: HardResetImpactSnapshot,
});
export type HardResetResult = typeof HardResetResult.Type;

export class ResetDepartmentError extends Schema.TaggedErrorClass<ResetDepartmentError>()(
  "ResetDepartmentError",
  {
    reason: Schema.Literals([
      "workspace-unavailable",
      "unsafe-target",
      "cleanup-failed",
      "inspection-failed",
      "stale-preview",
      "stash-failed",
      "reset-blocked",
      "reset-failed",
    ]),
    message: TrimmedNonEmptyString,
    retryable: Schema.Boolean,
  },
) {}
