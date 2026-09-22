import { describe, expect, it, vi } from "vitest";

import { Deferred, Effect, Fiber } from "effect";

import { settleConcurrentTeardowns } from "./settleConcurrentTeardowns";

describe("settleConcurrentTeardowns", () => {
  it("settles every teardown before surfacing a failure", async () => {
    const started: number[] = [];
    const finished = vi.fn<(item: number) => void>();

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const fiber = yield* settleConcurrentTeardowns([1, 2, 3], (item) =>
          Effect.gen(function* () {
            started.push(item);
            yield* Deferred.await(gate);
            finished(item);
            if (item === 2) {
              return yield* Effect.fail(new Error("teardown failed"));
            }
          }),
        ).pipe(Effect.exit, Effect.forkChild);

        yield* Effect.yieldNow;
        expect(started).toEqual([1, 2, 3]);
        yield* Deferred.succeed(gate, undefined);
        return yield* Fiber.join(fiber);
      }),
    );

    expect(finished.mock.calls.map(([item]) => item).toSorted()).toEqual([1, 2, 3]);
    expect(exit._tag).toBe("Failure");
  });
});
