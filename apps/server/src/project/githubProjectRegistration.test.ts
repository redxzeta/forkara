import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  makeGitHubProjectProvisionError,
  type GitHubProjectCheckoutResult,
} from "./githubProjectProvisioning";
import { recoverUnregisteredGitHubCheckout } from "./githubProjectRegistration";

function checkout(kind: "created" | "reused"): GitHubProjectCheckoutResult {
  return {
    operationId: "operation-1",
    repository: "openai/codex",
    workspaceRoot: "/repos/codex",
    checkout: kind,
    forkCreated: false,
    recoveryPath: kind === "created" ? "/repos/.forkara-clone-1" : null,
  };
}

describe("recoverUnregisteredGitHubCheckout", () => {
  it("moves a newly created checkout to recovery storage when registration did not commit", async () => {
    const moves: Array<[string, string]> = [];

    await Effect.runPromise(
      recoverUnregisteredGitHubCheckout({
        checkout: checkout("created"),
        registrationCommitted: false,
        moveWorkspaceRoot: (workspaceRoot, recoveryPath) =>
          Effect.sync(() => moves.push([workspaceRoot, recoveryPath])),
      }),
    );

    expect(moves).toEqual([["/repos/codex", "/repos/.forkara-clone-1"]]);
  });

  it.each([
    ["a reused checkout", checkout("reused"), false],
    ["a registered checkout", checkout("created"), true],
  ])("preserves %s", async (_label, provisionedCheckout, registrationCommitted) => {
    let moved = false;

    await Effect.runPromise(
      recoverUnregisteredGitHubCheckout({
        checkout: provisionedCheckout,
        registrationCommitted,
        moveWorkspaceRoot: () => Effect.sync(() => (moved = true)),
      }),
    );

    expect(moved).toBe(false);
  });

  it("finishes checkout recovery before mapping the registration failure", async () => {
    const events: string[] = [];
    const failure = await Effect.runPromise(
      Effect.fail(new Error("registration secret=private-value")).pipe(
        Effect.onError(() =>
          recoverUnregisteredGitHubCheckout({
            checkout: checkout("created"),
            registrationCommitted: false,
            moveWorkspaceRoot: () => Effect.sync(() => events.push("recovered")),
          }),
        ),
        Effect.mapError((cause) => {
          events.push("mapped");
          return makeGitHubProjectProvisionError(
            "operation-1",
            "REGISTRATION_FAILED",
            "Forkara cloned the repository but could not register the project.",
            { cause },
          );
        }),
        Effect.flip,
      ),
    );

    expect(events).toEqual(["recovered", "mapped"]);
    expect(failure).toMatchObject({
      operationId: "operation-1",
      stage: "registration",
      code: "REGISTRATION_FAILED",
    });
    expect(failure.technicalDetails).not.toContain("private-value");
  });
});
