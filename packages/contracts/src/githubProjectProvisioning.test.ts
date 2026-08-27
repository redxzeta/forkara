import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  GitHubProjectProvisionInput,
  GitHubProjectProvisionResult,
} from "./githubProjectProvisioning";

const legacyInput = {
  operationId: "operation-1",
  repository: "openai/codex",
  destinationParent: "/projects",
  directoryName: "codex",
  commandId: "command-1",
  projectId: "project-1",
  newProjectSpaceId: null,
  defaultModelSelection: { provider: "codex" as const, model: "gpt-5" },
  createdAt: "2026-08-04T00:00:00.000Z",
};

describe("GitHubProjectProvisionInput", () => {
  it("decodes missing legacy intent as a direct clone", () => {
    expect(Schema.decodeUnknownSync(GitHubProjectProvisionInput)(legacyInput)).toMatchObject({
      operation: "clone",
      forkDestinationOwner: null,
    });
  });

  it("decodes explicit fork-and-clone intent with an optional destination", () => {
    const decode = Schema.decodeUnknownSync(GitHubProjectProvisionInput);

    expect(
      decode({
        ...legacyInput,
        operation: "fork-and-clone",
        forkDestinationOwner: "example-org",
      }),
    ).toMatchObject({ operation: "fork-and-clone", forkDestinationOwner: "example-org" });
  });
});

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
