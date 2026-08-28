import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  GitHubProjectProvisionError,
  ProjectId,
  type GitHubProjectProvisionInput,
} from "@forkara/contracts";
import { Deferred, Effect, Fiber, FileSystem, Path, PlatformError } from "effect";
import { describe, expect, it } from "vitest";

import { GitCommandError, GitHubCliError } from "../git/Errors";
import type { GitCoreShape } from "../git/Services/GitCore";
import type { GitHubCliShape } from "../git/Services/GitHubCli";
import {
  makeGitHubProjectProvisioner,
  redactProvisioningTechnicalDetails,
} from "./githubProjectProvisioning";

function makeInput(destinationParent: string): GitHubProjectProvisionInput {
  return {
    operationId: "operation-1",
    operation: "clone",
    forkDestinationOwner: null,
    repository: "openai/codex",
    destinationParent,
    directoryName: "codex",
    commandId: CommandId.makeUnsafe("command-1"),
    projectId: ProjectId.makeUnsafe("project-1"),
    newProjectSpaceId: null,
    defaultModelSelection: { provider: "codex", model: "gpt-5" },
    createdAt: "2026-08-04T00:00:00.000Z",
  };
}

function unavailableGitHubCli(): GitHubCliShape {
  return {
    getViewerLogin: () =>
      Effect.fail(
        new GitHubCliError({
          operation: "getViewerLogin",
          detail: "GitHub CLI is not installed.",
          reason: "not-installed",
        }),
      ),
  } as unknown as GitHubCliShape;
}

describe("GitHub project provisioning", () => {
  it("bounds and redacts technical details before transport", () => {
    const details = redactProvisioningTechnicalDetails(
      new Error(
        [
          "Authorization: Bearer header-secret",
          "https://user:password@github.com/openai/codex.git?token=query-secret&safe=yes",
          "GITHUB_TOKEN=assignment-secret",
          "github_pat_0123456789abcdefghijklmnopqrstuvwxyz",
          "x".repeat(5_000),
        ].join("\n"),
      ),
    );

    expect(details).not.toContain("header-secret");
    expect(details).not.toContain("password");
    expect(details).not.toContain("query-secret");
    expect(details).not.toContain("assignment-secret");
    expect(details).not.toContain("github_pat_");
    expect(details).toContain("[REDACTED]");
    expect(details?.length).toBeLessThanOrEqual(4_096);
  });

  function makeForkAwareGitHubCliStub(fileSystem: FileSystem.FileSystem): GitHubCliShape {
    const isForkInfo = JSON.stringify({
      isFork: false,
      parent: null,
    });
    return {
      getViewerLogin: () => Effect.succeed("octocat"),
      getRepositoryCloneUrls: (input: Parameters<GitHubCliShape["getRepositoryCloneUrls"]>[0]) =>
        Effect.succeed({
          nameWithOwner: input.repository,
          url: `https://github.com/${input.repository}.git`,
          sshUrl: `git@github.com:${input.repository}.git`,
        }),
      execute: (input: Parameters<GitHubCliShape["execute"]>[0]) =>
        Effect.gen(function* () {
          const args = input.args;
          if (args[0] === "repo" && args[1] === "view") {
            return { code: 0, stdout: isForkInfo, stderr: "", signal: null, timedOut: false };
          }
          if (args[0] === "repo" && args[1] === "fork") {
            return { code: 0, stdout: "", stderr: "", signal: null, timedOut: false };
          }
          if (args[0] === "repo" && args[1] === "clone") {
            const stagingPath = args[4] ?? "";
            yield* fileSystem.makeDirectory(stagingPath, { recursive: true });
            return {
              code: 0,
              stdout: "",
              stderr: "",
              signal: null,
              timedOut: false,
            };
          }
          return yield* Effect.fail(
            new GitHubCliError({
              operation: `gh ${args.join(" ")}`,
              detail: "Unexpected GitHub CLI command in test",
              reason: "other",
            }),
          );
        }),
    } as unknown as GitHubCliShape;
  }

  function makeGitCoreStub(
    fileSystem: FileSystem.FileSystem,
    verifyOrigin = "openai/codex",
  ): GitCoreShape {
    return {
      execute: (input: Parameters<GitCoreShape["execute"]>[0]) =>
        Effect.gen(function* () {
          if (input.operation === "clone GitHub project directly") {
            yield* fileSystem.makeDirectory(input.args.at(-1) ?? "", { recursive: true });
            return { code: 0, stdout: "", stderr: "" };
          }

          if (input.operation === "verify GitHub project clone") {
            return { code: 0, stdout: `https://github.com/${verifyOrigin}.git\n`, stderr: "" };
          }

          if (input.operation === "inspect upstream") {
            return { code: 2, stdout: "", stderr: "error: No such remote 'upstream'" };
          }

          return { code: 0, stdout: "https://github.com/openai/codex.git\n", stderr: "" };
        }),
    } as unknown as GitCoreShape;
  }

  it("creates an authenticated fork, clones it, and configures the source as upstream", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const ghCalls: ReadonlyArray<string>[] = [];
        const githubBase = makeForkAwareGitHubCliStub(fileSystem);
        const github = {
          ...githubBase,
          execute: (input: Parameters<GitHubCliShape["execute"]>[0]) =>
            Effect.gen(function* () {
              ghCalls.push(input.args);
              return yield* githubBase.execute(input);
            }),
        } as unknown as GitHubCliShape;
        const gitCalls: ReadonlyArray<string>[] = [];
        const gitBase = makeGitCoreStub(fileSystem, "octocat/codex");
        const git = {
          ...gitBase,
          execute: (input: Parameters<GitCoreShape["execute"]>[0]) => {
            gitCalls.push(input.args);
            return gitBase.execute(input);
          },
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github,
        });
        return {
          provisioned: yield* provisioner.provisionCheckout(
            { ...makeInput(parent), operation: "fork-and-clone" },
            {
              publish: () => Effect.void,
            },
          ),
          ghCalls,
          gitCalls,
        };
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result.provisioned.checkout).toBe("created");
    expect(result.provisioned.forkCreated).toBe(true);
    expect(result.ghCalls).toEqual([
      ["repo", "view", "openai/codex", "--json", "isFork,parent"],
      ["repo", "fork", "openai/codex", "--clone=false"],
      [
        "repo",
        "clone",
        "--no-upstream",
        "octocat/codex",
        expect.stringContaining(".forkara-clone-"),
        "--",
        "--progress",
      ],
    ]);
    expect(result.gitCalls).toContainEqual([
      "remote",
      "add",
      "upstream",
      "https://github.com/openai/codex.git",
    ]);
  });

  it("creates the fork under a configured destination owner", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const ghCalls: ReadonlyArray<string>[] = [];
        const githubBase = makeForkAwareGitHubCliStub(fileSystem);
        const github = {
          ...githubBase,
          execute: (input: Parameters<GitHubCliShape["execute"]>[0]) =>
            Effect.gen(function* () {
              ghCalls.push(input.args);
              return yield* githubBase.execute(input);
            }),
        } as unknown as GitHubCliShape;
        const git = makeGitCoreStub(fileSystem, "example-org/codex");
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github,
        });
        return {
          provisioned: yield* provisioner.provisionCheckout(
            {
              ...makeInput(parent),
              operation: "fork-and-clone",
              forkDestinationOwner: "example-org",
            },
            {
              publish: () => Effect.void,
            },
          ),
          ghCalls,
        };
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result.provisioned.checkout).toBe("created");
    expect(result.ghCalls).toContainEqual([
      "repo",
      "fork",
      "openai/codex",
      "--clone=false",
      "--org",
      "example-org",
    ]);
  });

  it("clones directly even when GitHub CLI is authenticated", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const calls: Array<{ readonly operation: string; readonly args: readonly string[] }> = [];
        const gitBase = makeGitCoreStub(fileSystem);
        const git = {
          ...gitBase,
          execute: (input: Parameters<GitCoreShape["execute"]>[0]) => {
            calls.push({ operation: input.operation, args: input.args });
            return gitBase.execute(input);
          },
        } as unknown as GitCoreShape;
        const github = {
          getViewerLogin: () =>
            Effect.die(new Error("clone-only must not inspect GitHub authentication")),
          execute: () => Effect.die(new Error("clone-only must not invoke GitHub CLI")),
        } as unknown as GitHubCliShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github,
        });
        return {
          provisioned: yield* provisioner.provisionCheckout(makeInput(parent), {
            publish: () => Effect.void,
          }),
          calls,
        };
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result.provisioned.repository).toBe("openai/codex");
    expect(result.provisioned.forkCreated).toBe(false);
    expect(result.calls[0]).toMatchObject({
      operation: "clone GitHub project directly",
      args: [
        "clone",
        "--progress",
        "--",
        "https://github.com/openai/codex.git",
        expect.stringContaining(".forkara-clone-"),
      ],
    });
    expect(result.calls.some((call) => call.args.includes("upstream"))).toBe(false);
  });

  it("requires authenticated GitHub CLI only for explicit fork-and-clone", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git: makeGitCoreStub(fileSystem),
          github: unavailableGitHubCli(),
        });
        return yield* provisioner
          .provisionCheckout(
            { ...makeInput(parent), operation: "fork-and-clone" },
            { publish: () => Effect.void },
          )
          .pipe(Effect.flip);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(failure).toMatchObject({
      operationId: "operation-1",
      stage: "access",
      code: "GITHUB_AUTH_REQUIRED",
      retryable: false,
    });
    expect(failure.summary).toContain("gh auth login");
  });

  it("rejects a fork destination on clone-only input", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git: makeGitCoreStub(fileSystem),
          github: unavailableGitHubCli(),
        });
        return yield* provisioner
          .provisionCheckout(
            { ...makeInput(parent), forkDestinationOwner: "example-org" },
            { publish: () => Effect.void },
          )
          .pipe(Effect.flip);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(failure).toMatchObject({
      operationId: "operation-1",
      stage: "validation",
      code: "FORK_DESTINATION_INVALID",
      retryable: false,
    });
  });

  it("reuses an existing fork after GitHub reports that it already exists", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const githubBase = makeForkAwareGitHubCliStub(fileSystem);
        const github = {
          ...githubBase,
          execute: (input: Parameters<GitHubCliShape["execute"]>[0]) =>
            input.args[1] === "fork"
              ? Effect.fail(
                  new GitHubCliError({
                    operation: "gh repo fork",
                    detail: "fork already exists",
                    reason: "other",
                  }),
                )
              : githubBase.execute(input),
        } as unknown as GitHubCliShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git: makeGitCoreStub(fileSystem, "octocat/codex"),
          github,
        });
        return yield* provisioner.provisionCheckout(
          { ...makeInput(parent), operation: "fork-and-clone" },
          { publish: () => Effect.void },
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result).toMatchObject({
      repository: "octocat/codex",
      forkCreated: false,
      checkout: "created",
    });
  });

  it("clones into staging, verifies origin, and atomically promotes the checkout", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const calls: string[] = [];
        const git = {
          execute: (input: Parameters<GitCoreShape["execute"]>[0]) =>
            Effect.gen(function* () {
              calls.push(input.operation);
              if (input.operation === "clone GitHub project directly") {
                yield* fileSystem.makeDirectory(input.args.at(-1) ?? "", { recursive: true });
                return { code: 0, stdout: "", stderr: "" };
              }
              return {
                code: 0,
                stdout: "https://github.com/openai/codex.git\n",
                stderr: "",
              };
            }),
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        const provisioned = yield* provisioner.provisionCheckout(makeInput(parent), {
          publish: () => Effect.void,
        });
        return {
          provisioned,
          calls,
          entries: yield* fileSystem.readDirectory(parent),
        };
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result.provisioned.checkout).toBe("created");
    expect(result.provisioned.workspaceRoot).toMatch(/[/\\]codex$/);
    expect(result.entries).toEqual(["codex"]);
    expect(result.calls).toEqual(["clone GitHub project directly", "verify GitHub project clone"]);
  });

  it("reuses an existing checkout with the same GitHub origin", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        yield* fileSystem.makeDirectory(path.join(parent, "codex"));
        const calls: string[] = [];
        const git = {
          execute: (input: Parameters<GitCoreShape["execute"]>[0]) => {
            calls.push(input.operation);
            return Effect.succeed({
              code: 0,
              stdout: "git@github.com:openai/codex.git\n",
              stderr: "",
            });
          },
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        return {
          provisioned: yield* provisioner.provisionCheckout(makeInput(parent), {
            publish: () => Effect.void,
          }),
          calls,
        };
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result.provisioned.checkout).toBe("reused");
    expect(result.provisioned.forkCreated).toBe(false);
    expect(result.calls).toEqual(["verify GitHub project clone"]);
  });

  it("reports a conflict for an existing directory that is not a Git checkout", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        yield* fileSystem.makeDirectory(path.join(parent, "codex"));
        const git = {
          execute: () =>
            Effect.succeed({
              code: 128,
              stdout: "",
              stderr: "fatal: not a git repository",
            }),
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        return yield* provisioner
          .provisionCheckout(makeInput(parent), { publish: () => Effect.void })
          .pipe(Effect.flip);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(failure.code).toBe("DESTINATION_CONFLICT");
    expect(failure.retryable).toBe(false);
  });

  it("distinguishes a missing destination parent", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const missing = path.join(parent, "missing");
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git: makeGitCoreStub(fileSystem),
          github: unavailableGitHubCli(),
        });
        return yield* provisioner
          .provisionCheckout(makeInput(missing), { publish: () => Effect.void })
          .pipe(Effect.flip);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(failure).toMatchObject({
      operationId: "operation-1",
      stage: "destination",
      code: "DESTINATION_MISSING",
      retryable: false,
    });
  });

  it("verifies destination write access before cloning", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        let cloneStarted = false;
        const unwritableFileSystem = {
          ...fileSystem,
          makeTempDirectory: () =>
            Effect.fail(
              PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "makeTempDirectory",
              }),
            ),
        } satisfies FileSystem.FileSystem;
        const git = {
          execute: () => {
            cloneStarted = true;
            return Effect.die("clone must not start");
          },
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem: unwritableFileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        const failure = yield* provisioner
          .provisionCheckout(makeInput(parent), { publish: () => Effect.void })
          .pipe(Effect.flip);
        return { failure, cloneStarted };
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result.failure).toMatchObject({
      stage: "destination",
      code: "DESTINATION_UNWRITABLE",
      retryable: false,
    });
    expect(result.cloneStarted).toBe(false);
  });

  it("preserves transient Git failures while inspecting an existing checkout", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        yield* fileSystem.makeDirectory(path.join(parent, "codex"));
        const git = {
          execute: () =>
            Effect.fail(
              new GitCommandError({
                operation: "verify GitHub project clone",
                command: "git remote get-url origin",
                cwd: path.join(parent, "codex"),
                detail: "connection reset",
              }),
            ),
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        return yield* provisioner
          .provisionCheckout(makeInput(parent), { publish: () => Effect.void })
          .pipe(Effect.flip);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(failure.code).toBe("CLONE_TRANSPORT_FAILED");
    expect(failure.retryable).toBe(true);
  });

  it("removes only its owned staging directory after a failed clone", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const git = {
          execute: (input: Parameters<GitCoreShape["execute"]>[0]) =>
            Effect.gen(function* () {
              const stagingPath = input.args.at(-1) ?? "";
              yield* fileSystem.makeDirectory(stagingPath, { recursive: true });
              return yield* new GitCommandError({
                operation: input.operation,
                command: "git clone",
                cwd: input.cwd,
                detail: "connection reset",
              });
            }),
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        const failure = yield* provisioner
          .provisionCheckout(makeInput(parent), { publish: () => Effect.void })
          .pipe(Effect.flip);
        return { failure, entries: yield* fileSystem.readDirectory(parent) };
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result.failure).toBeInstanceOf(GitHubProjectProvisionError);
    expect(result.failure).toMatchObject({
      operationId: "operation-1",
      stage: "clone",
      code: "CLONE_TRANSPORT_FAILED",
    });
    expect(result.entries).toEqual([]);
  });

  it("classifies Git HTTPS 403 responses as an authentication problem", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const git = {
          execute: (input: Parameters<GitCoreShape["execute"]>[0]) =>
            Effect.fail(
              new GitCommandError({
                operation: input.operation,
                command: "git clone",
                cwd: input.cwd,
                detail: "fatal: unable to access repository: The requested URL returned error: 403",
              }),
            ),
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        return yield* provisioner
          .provisionCheckout(makeInput(parent), { publish: () => Effect.void })
          .pipe(Effect.flip);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(failure.code).toBe("CLONE_CREDENTIAL_FAILED");
    expect(failure.retryable).toBe(false);
  });

  it("distinguishes the configured clone timeout from a network timeout", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const git = {
          execute: (input: Parameters<GitCoreShape["execute"]>[0]) =>
            Effect.fail(
              new GitCommandError({
                operation: input.operation,
                command: "git clone",
                cwd: input.cwd,
                detail: "git clone timed out.",
              }),
            ),
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        return yield* provisioner
          .provisionCheckout(makeInput(parent), { publish: () => Effect.void })
          .pipe(Effect.flip);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(failure.code).toBe("CLONE_TIMEOUT");
    expect(failure.retryable).toBe(false);
    expect(failure.summary).toContain("30-minute limit");
  });

  it("reports a clone failure when the target appears during promotion", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const git = makeGitCoreStub(fileSystem, "openai/codex");
        const fileSystemWithPromotionRace = {
          ...fileSystem,
          rename: () =>
            Effect.fail(
              PlatformError.systemError({
                _tag: "AlreadyExists",
                module: "FileSystem",
                method: "rename",
              }),
            ),
        } satisfies FileSystem.FileSystem;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem: fileSystemWithPromotionRace,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        return yield* provisioner
          .provisionCheckout(makeInput(parent), { publish: () => Effect.void })
          .pipe(Effect.flip);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(failure.code).toBe("DESTINATION_CONFLICT");
    expect(failure.retryable).toBe(false);
  });

  it("removes its staging directory when an in-flight clone is cancelled", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "synara-provision-" });
        const cloneStarted = yield* Deferred.make<void>();
        const git = {
          execute: (input: Parameters<GitCoreShape["execute"]>[0]) =>
            Effect.gen(function* () {
              const stagingPath = input.args.at(-1) ?? "";
              yield* fileSystem.makeDirectory(stagingPath, { recursive: true });
              yield* Deferred.succeed(cloneStarted, undefined);
              return yield* Effect.never;
            }),
        } as unknown as GitCoreShape;
        const provisioner = yield* makeGitHubProjectProvisioner({
          homeDir: parent,
          fileSystem,
          path,
          git,
          github: unavailableGitHubCli(),
        });
        const fiber = yield* provisioner
          .provisionCheckout(makeInput(parent), {
            publish: () => Effect.void,
          })
          .pipe(Effect.forkScoped);

        yield* Deferred.await(cloneStarted);
        yield* Fiber.interrupt(fiber);
        return yield* fileSystem.readDirectory(parent);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result).toEqual([]);
  });
});
