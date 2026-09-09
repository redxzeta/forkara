import { describe, expect, it } from "vitest";

import * as OfficialAcp from "@agentclientprotocol/sdk";
import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Queue,
  Scope,
  Sink,
  Stream,
} from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { TestClock } from "effect/testing";
import type * as Acp from "@agentclientprotocol/sdk";

import {
  AcpSessionRuntime,
  assistantItemId,
  awaitAcpChildExit,
  decodeSetSessionConfigOptionResponse,
  isAcpAuthRequiredError,
  isAcpStartupTimeoutError,
  makeAcpIncomingFrameGuard,
  makeStartupInteractionRegistry,
  runAcpFreshSessionSetup,
  sessionConfigOptionsFromSetup,
  teardownAcpChildProcess,
} from "./AcpSessionRuntime.ts";
import * as AcpErrors from "./AcpErrors.ts";

it.each(["overflow", "scope close"])(
  "releases a stalled SDK notification handler on %s",
  async (mode) => {
    const clientToAgent = Effect.runSync(Queue.unbounded<Uint8Array>());
    const agentToClient = Effect.runSync(Queue.unbounded<Uint8Array>());
    const promptStarted = Deferred.makeUnsafe<void>();
    const handlerStarted = Deferred.makeUnsafe<void>();
    let notificationsHandled = 0;
    let handlerInterrupted = false;
    let agentConnection: { close(error?: unknown): void } | undefined;
    const agentApp = OfficialAcp.agent({ name: "memory-test" })
      .onRequest(OfficialAcp.methods.agent.initialize, () => ({
        protocolVersion: 1,
        agentCapabilities: {},
        authMethods: [{ id: "test", name: "Test" }],
      }))
      .onRequest(OfficialAcp.methods.agent.authenticate, () => ({}))
      .onRequest(OfficialAcp.methods.agent.session.new, () => ({ sessionId: "memory-session" }))
      .onRequest(OfficialAcp.methods.agent.session.prompt, () => {
        Deferred.doneUnsafe(promptStarted, Effect.void);
        return new Promise<never>(() => {});
      });
    const spawnerLayer = Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() =>
        Effect.sync(() => {
          const input = new ReadableStream<Uint8Array>({
            pull: (controller) =>
              Effect.runPromise(Queue.take(clientToAgent)).then((chunk) => {
                controller.enqueue(chunk);
              }),
          });
          const output = new WritableStream<Uint8Array>({
            write: (chunk) =>
              Effect.runPromise(Queue.offer(agentToClient, chunk)).then(() => undefined),
          });
          agentConnection = agentApp.connect(OfficialAcp.ndJsonStream(output, input));
          return ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(1),
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
            isRunning: Effect.succeed(true),
            kill: () => Effect.void,
            stdin: Sink.forEach((chunk: Uint8Array) => Queue.offer(clientToAgent, chunk)),
            stdout: Stream.fromQueue(agentToClient),
            stderr: Stream.never,
            all: Stream.never,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.never,
          });
        }),
      ),
    );
    const runtimeLayer = AcpSessionRuntime.layer({
      spawn: { command: "in-memory-acp-agent", args: [] },
      cwd: process.cwd(),
      clientInfo: { name: "memory-test", version: "0.0.0" },
      authMethodId: "test",
      teardownProcessTree: async () => ({ escalated: false, signalErrors: [] }),
    }).pipe(Layer.provide(spawnerLayer));
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* AcpSessionRuntime;
          yield* runtime.start();
          yield* runtime.handleSessionUpdate(() =>
            Effect.gen(function* () {
              notificationsHandled++;
              yield* Deferred.succeed(handlerStarted, undefined);
              yield* Effect.never;
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  handlerInterrupted = true;
                }),
              ),
            ),
          );
          const prompt = yield* runtime
            .prompt({ prompt: [{ type: "text", text: "test" }] })
            .pipe(Effect.forkChild);
          yield* Deferred.await(promptStarted);
          const frame = new TextEncoder().encode(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "session/update",
              params: {
                sessionId: "memory-session",
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: "x".repeat(1024 * 1024) },
                },
              },
            }) + "\n",
          );
          yield* Queue.offer(agentToClient, frame);
          yield* Deferred.await(handlerStarted);
          if (mode === "scope close") return;
          for (let index = 0; index < 33; index++) yield* Queue.offer(agentToClient, frame);
          const error = yield* Fiber.join(prompt).pipe(Effect.flip);
          expect(error).toMatchObject({
            _tag: "AcpTransportError",
            detail: expect.stringContaining("memory budget"),
          });
          expect(notificationsHandled).toBe(1);
        }).pipe(Effect.provide(runtimeLayer), Effect.scoped),
      );
      expect(handlerInterrupted).toBe(true);
    } finally {
      agentConnection?.close();
      await Effect.runPromise(Queue.shutdown(clientToAgent));
      await Effect.runPromise(Queue.shutdown(agentToClient));
    }
  },
  10_000,
);

describe("makeAcpIncomingFrameGuard", () => {
  const encode = (value: string) => new TextEncoder().encode(value);

  it("enforces the frame budget across split chunks and resets it at newline boundaries", () => {
    const guard = makeAcpIncomingFrameGuard(5);

    expect(guard(encode("123"))).toBeUndefined();
    expect(guard(encode("45\n12345\n"))).toBeUndefined();
    expect(guard(encode("1\n"))).toBeUndefined();
  });

  it("rejects an oversized unterminated frame", () => {
    const guard = makeAcpIncomingFrameGuard(5);

    expect(guard(encode("123"))).toBeUndefined();
    const error = guard(encode("456"));
    expect(error?._tag).toBe("AcpTransportError");
    expect(error?.detail).toContain("5-byte limit");
  });
});

describe("teardownAcpChildProcess", () => {
  it("keeps ACP scope closure pending until the owned root exit settles", async () => {
    const processExited = Deferred.makeUnsafe<number>();
    const exitCode = Deferred.await(processExited);
    let observeTeardown!: (input: {
      readonly rootPid: number;
      readonly rootExited: Promise<unknown>;
    }) => void;
    const teardownStarted = new Promise<{
      readonly rootPid: number;
      readonly rootExited: Promise<unknown>;
    }>((resolve) => {
      observeTeardown = resolve;
    });
    const scope = await Effect.runPromise(Scope.make("sequential"));

    await Effect.runPromise(
      Effect.addFinalizer(() =>
        teardownAcpChildProcess({ pid: 4_242, exitCode }, async (input) => {
          observeTeardown(input);
          await input.rootExited;
          return { escalated: false, signalErrors: [] };
        }),
      ).pipe(Effect.provideService(Scope.Scope, scope)),
    );

    let scopeClosed = false;
    const closing = Effect.runPromise(Scope.close(scope, Exit.void)).then(() => {
      scopeClosed = true;
    });
    const teardown = await teardownStarted;
    expect(teardown.rootPid).toBe(4_242);
    await Promise.resolve();
    expect(scopeClosed).toBe(false);

    Deferred.doneUnsafe(processExited, Effect.succeed(0));
    await closing;
    expect(scopeClosed).toBe(true);
  });
});

describe("awaitAcpChildExit", () => {
  it("completes for both successful and failed child exit signals", async () => {
    const successfulExit = Deferred.makeUnsafe<number>();
    const failedExit = Deferred.makeUnsafe<number, Error>();
    let successfulCompleted = false;
    let failedCompleted = false;

    const successfulWait = Effect.runPromise(
      awaitAcpChildExit({ pid: 1, exitCode: Deferred.await(successfulExit) }),
    ).then(() => {
      successfulCompleted = true;
    });
    const failedWait = Effect.runPromise(
      awaitAcpChildExit({ pid: 2, exitCode: Deferred.await(failedExit) }),
    ).then(() => {
      failedCompleted = true;
    });

    await Promise.resolve();
    expect(successfulCompleted).toBe(false);
    expect(failedCompleted).toBe(false);

    Deferred.doneUnsafe(successfulExit, Effect.succeed(0));
    Deferred.doneUnsafe(failedExit, Effect.fail(new Error("child exit signal failed")));
    await Promise.all([successfulWait, failedWait]);

    expect(successfulCompleted).toBe(true);
    expect(failedCompleted).toBe(true);
  });
});

describe("runAcpFreshSessionSetup", () => {
  it("retries one matching fresh-session failure and then succeeds", async () => {
    const retryable = new AcpErrors.AcpRequestError({
      code: -32603,
      errorMessage: "Path not found.",
      data: { code: "FS_NOT_FOUND" },
    });
    let attempts = 0;
    const setup = Effect.suspend(() => {
      attempts += 1;
      return attempts === 1 ? Effect.fail(retryable) : Effect.succeed("session-ready");
    });

    await expect(
      Effect.runPromise(
        runAcpFreshSessionSetup(setup, {
          shouldRetry: (error) => error === retryable,
        }),
      ),
    ).resolves.toBe("session-ready");
    expect(attempts).toBe(2);
  });

  it("does not retry a non-matching failure", async () => {
    const terminal = new AcpErrors.AcpRequestError({
      code: -32603,
      errorMessage: "Permission denied.",
      data: { code: "FS_PERMISSION_DENIED" },
    });
    let attempts = 0;
    const setup = Effect.suspend(() => {
      attempts += 1;
      return Effect.fail(terminal);
    });

    await expect(
      Effect.runPromise(
        runAcpFreshSessionSetup(setup, {
          shouldRetry: () => false,
        }),
      ),
    ).rejects.toThrow("Permission denied.");
    expect(attempts).toBe(1);
  });
});

describe("assistantItemId", () => {
  // Format contract only — distinct runtimeInstanceId wiring is covered by
  // AcpJsonRpcConnection.test.ts ("assigns distinct fallback assistant item ids...").
  it("produces distinct ids across runtime instances with the same session id and segment index", () => {
    const sessionId = "session-1";
    const a = assistantItemId(sessionId, "aaaa1111", 0);
    const b = assistantItemId(sessionId, "bbbb2222", 0);
    expect(a).not.toBe(b);
    expect(a).toBe("assistant:session-1:aaaa1111:segment:0");
    expect(b).toBe("assistant:session-1:bbbb2222:segment:0");
  });
});

describe("decodeSetSessionConfigOptionResponse", () => {
  const configOptions = [
    {
      id: "model",
      name: "Model",
      type: "select",
      currentValue: "gpt-5.6-luna",
      options: [{ value: "gpt-5.6-luna", name: "GPT-5.6 Luna" }],
    },
  ] satisfies ReadonlyArray<Acp.SessionConfigOption>;

  it("uses the matching config update for an empty response", () => {
    const decoded = Effect.runSync(
      decodeSetSessionConfigOptionResponse({}, Effect.succeed(configOptions)),
    );
    expect(decoded).toEqual({ configOptions });
  });

  it("strictly decodes a non-empty response without awaiting an update", () => {
    let awaitedUpdate = false;
    const decoded = Effect.runSync(
      decodeSetSessionConfigOptionResponse(
        { configOptions },
        Effect.sync(() => {
          awaitedUpdate = true;
          return [];
        }),
      ),
    );
    expect(decoded).toEqual({ configOptions });
    expect(awaitedUpdate).toBe(false);
  });

  it("rejects an invalid non-empty response", async () => {
    const error = await Effect.runPromise(
      decodeSetSessionConfigOptionResponse(
        { unexpected: true },
        Effect.succeed(configOptions),
      ).pipe(Effect.flip),
    );
    expect(error._tag).toBe("AcpTransportError");
    if (error._tag === "AcpTransportError") {
      expect(error.detail).toContain("invalid session/set_config_option response");
    }
  });
});

describe("sessionConfigOptionsFromSetup", () => {
  const replayedConfigOptions = [
    {
      id: "model",
      name: "Model",
      type: "select",
      currentValue: "gpt-5.6-luna",
      options: [{ value: "gpt-5.6-luna", name: "GPT-5.6 Luna" }],
    },
  ] satisfies ReadonlyArray<Acp.SessionConfigOption>;

  it("preserves config retained from replay when setup omits configOptions", () => {
    expect(sessionConfigOptionsFromSetup({}, replayedConfigOptions)).toBe(replayedConfigOptions);
  });

  it("uses an explicit setup inventory instead of replayed config", () => {
    expect(sessionConfigOptionsFromSetup({ configOptions: [] }, replayedConfigOptions)).toEqual([]);
  });
});
