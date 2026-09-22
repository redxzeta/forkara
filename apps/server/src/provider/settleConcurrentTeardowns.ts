import { Effect, Exit } from "effect";

/**
 * Starts every teardown before surfacing a failure so one broken session cannot
 * leave the remaining provider processes running.
 */
export function settleConcurrentTeardowns<Item, Error, Requirements>(
  items: Iterable<Item>,
  teardown: (item: Item) => Effect.Effect<void, Error, Requirements>,
): Effect.Effect<void, Error, Requirements> {
  return Effect.gen(function* () {
    const results = yield* Effect.forEach(
      Array.from(items),
      (item) => Effect.exit(teardown(item)),
      { concurrency: "unbounded" },
    );
    const failed = results.find(Exit.isFailure);
    if (failed) {
      return yield* Effect.failCause(failed.cause);
    }
  });
}
