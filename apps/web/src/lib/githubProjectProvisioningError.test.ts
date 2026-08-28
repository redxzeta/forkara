import { GitHubProjectProvisionError } from "@forkara/contracts";
import { describe, expect, it } from "vitest";

import {
  coalesceProvisioningFailure,
  isGitHubProjectProvisionError,
  provisioningFailureStableKey,
} from "./githubProjectProvisioningError";

function failure(operationId = "operation-1") {
  return new GitHubProjectProvisionError({
    operationId,
    stage: "clone",
    code: "CLONE_TRANSPORT_FAILED",
    summary: "Clone transport failed.",
    correctiveAction: "Check the network and retry.",
    technicalDetails: "connection reset",
    retryable: true,
  });
}

describe("GitHub provisioning failure presentation", () => {
  it("recognizes decoded transport errors without relying on instanceof", () => {
    expect(isGitHubProjectProvisionError({ ...failure() })).toBe(true);
    expect(isGitHubProjectProvisionError(new Error("clone failed"))).toBe(false);
  });

  it("coalesces repeated delivery by operation, stage, and code", () => {
    const first = coalesceProvisioningFailure(null, failure());
    const repeated = coalesceProvisioningFailure(first, failure());
    const retry = coalesceProvisioningFailure(repeated, failure("operation-2"));

    expect(provisioningFailureStableKey(failure())).toBe(
      "operation-1:clone:CLONE_TRANSPORT_FAILED",
    );
    expect(repeated).toMatchObject({ occurrenceCount: 2, stableKey: first.stableKey });
    expect(retry).toMatchObject({ occurrenceCount: 1 });
  });
});
