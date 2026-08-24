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

export class ResetDepartmentError extends Schema.TaggedErrorClass<ResetDepartmentError>()(
  "ResetDepartmentError",
  {
    reason: Schema.Literals(["workspace-unavailable", "unsafe-target", "cleanup-failed"]),
    message: TrimmedNonEmptyString,
    retryable: Schema.Boolean,
  },
) {}
