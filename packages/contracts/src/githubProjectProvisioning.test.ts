import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { GitHubProjectProvisionResult } from "./githubProjectProvisioning";

describe("GitHubProjectProvisionResult", () => {
  it("defaults the additive fork receipt for older provisioning servers", () => {
    const decode = Schema.decodeUnknownSync(GitHubProjectProvisionResult);
    const base = {
      operationId: "operation-1",
      repository: "octocat/forkara",
      workspaceRoot: "/projects/forkara",
      projectId: "project-1",
      checkout: "created" as const,
    };

    expect(decode(base).forkCreated).toBe(false);
    expect(decode({ ...base, forkCreated: true }).forkCreated).toBe(true);
  });
});
