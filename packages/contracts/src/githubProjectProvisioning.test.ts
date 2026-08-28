import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  GitHubProjectProvisionError,
  GitHubProjectProvisionInput,
  GitHubProjectProvisionResult,
} from "./githubProjectProvisioning";
import { WsProjectsProvisionFromGitHubRpc } from "./rpc";

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

describe("GitHubProjectProvisionError", () => {
  const failure = new GitHubProjectProvisionError({
    operationId: "operation-17",
    stage: "clone",
    code: "CLONE_TRANSPORT_FAILED",
    summary: "Forkara could not reach GitHub while cloning the repository.",
    correctiveAction: "Check the server network connection and retry.",
    technicalDetails: "connection reset by peer",
    retryable: true,
  });

  it("round-trips every actionable field through the shared schema", () => {
    const encoded = Schema.encodeUnknownSync(GitHubProjectProvisionError)(failure);
    expect(Schema.decodeUnknownSync(GitHubProjectProvisionError)(encoded)).toMatchObject({
      _tag: "GitHubProjectProvisionError",
      operationId: failure.operationId,
      stage: failure.stage,
      code: failure.code,
      summary: failure.summary,
      correctiveAction: failure.correctiveAction,
      technicalDetails: failure.technicalDetails,
      retryable: failure.retryable,
    });
  });

  it("survives the provisioning RPC error union", () => {
    const streamErrorSchema = (
      WsProjectsProvisionFromGitHubRpc.successSchema as unknown as {
        readonly error: typeof GitHubProjectProvisionError;
      }
    ).error;
    const encoded = Schema.encodeUnknownSync(streamErrorSchema)(failure);
    expect(Schema.decodeUnknownSync(streamErrorSchema)(encoded)).toMatchObject({
      _tag: "GitHubProjectProvisionError",
      operationId: failure.operationId,
      stage: failure.stage,
      code: failure.code,
    });
  });

  it("rejects unbounded technical details", () => {
    expect(() =>
      Schema.decodeUnknownSync(GitHubProjectProvisionError)({
        ...failure,
        technicalDetails: "x".repeat(4_097),
      }),
    ).toThrow();
  });
});
