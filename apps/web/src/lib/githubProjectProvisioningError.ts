// FILE: githubProjectProvisioningError.ts
// Purpose: Recognizes and coalesces typed Add Project provisioning failures.

import type { GitHubProjectProvisionError } from "@forkara/contracts";

export interface ProvisioningFailureOccurrence {
  readonly error: GitHubProjectProvisionError;
  readonly stableKey: string;
  readonly occurrenceCount: number;
}

export function isGitHubProjectProvisionError(
  value: unknown,
): value is GitHubProjectProvisionError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GitHubProjectProvisionError> & { readonly _tag?: unknown };
  return (
    candidate._tag === "GitHubProjectProvisionError" &&
    typeof candidate.operationId === "string" &&
    typeof candidate.stage === "string" &&
    typeof candidate.code === "string" &&
    typeof candidate.summary === "string" &&
    typeof candidate.correctiveAction === "string" &&
    (candidate.technicalDetails === null || typeof candidate.technicalDetails === "string") &&
    typeof candidate.retryable === "boolean"
  );
}

export function provisioningFailureStableKey(error: GitHubProjectProvisionError): string {
  return `${error.operationId}:${error.stage}:${error.code}`;
}

export function coalesceProvisioningFailure(
  current: ProvisioningFailureOccurrence | null,
  error: GitHubProjectProvisionError,
): ProvisioningFailureOccurrence {
  const stableKey = provisioningFailureStableKey(error);
  return {
    error,
    stableKey,
    occurrenceCount: current?.stableKey === stableKey ? current.occurrenceCount + 1 : 1,
  };
}
