// Opt-in synthetic startup replay probe; never opens an existing profile.
import { writeFileSync } from "node:fs";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { expect, it } from "vitest";
import { ProviderRuntimeEventRepositoryLive } from "../src/persistence/Layers/ProviderRuntimeEvents";
import { SqlitePersistenceMemory } from "../src/persistence/Layers/Sqlite";
import {
  PROVIDER_RUNTIME_INGESTION_CONSUMER,
  ProviderRuntimeEventRepository,
} from "../src/persistence/Services/ProviderRuntimeEvents";

it.skipIf(process.env.FORKARA_PERF !== "1")(
  "measures pruning and reading orphaned startup replay rows",
  async () => {
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const repository = yield* ProviderRuntimeEventRepository;
        const event = JSON.stringify({
          type: "content.delta",
          eventId: "fixture",
          provider: "codex",
          createdAt: "2026-09-07T00:00:00.000Z",
          threadId: "purged-thread",
          turnId: "purged-turn",
          payload: { streamKind: "assistant_text", delta: "x".repeat(1_024) },
        });
        const samples = [];
        for (let sample = -3; sample < 11; sample += 1) {
          yield* sql`DELETE FROM provider_runtime_events`;
          yield* sql`DELETE FROM provider_runtime_open_turns`;
          yield* sql`
            WITH RECURSIVE rows(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM rows WHERE n < 10000)
            INSERT INTO provider_runtime_events
              (sequence, event_id, thread_id, turn_id, event_type, event_json, persisted_at)
            SELECT n, 'fixture-' || n, 'purged-thread', 'purged-turn', 'content.delta',
              json_set(${event}, '$.eventId', 'fixture-' || n), '2026-09-07T00:00:00.000Z'
            FROM rows
          `;
          yield* sql`INSERT INTO provider_runtime_open_turns
            (thread_id, turn_id, first_sequence, updated_at)
            VALUES ('purged-thread', 'purged-turn', 1, '2026-09-07T00:00:00.000Z')`;
          yield* sql`UPDATE provider_runtime_event_consumers SET last_acked_sequence = 10000
            WHERE consumer_name = ${PROVIDER_RUNTIME_INGESTION_CONSUMER}`;
          const started = performance.now();
          yield* repository.pruneSettledOpenTurns;
          let cursor = 0;
          let replayedRows = 0;
          while (true) {
            const page = yield* repository.readAcceptedOpenTurnEvents({
              consumerName: PROVIDER_RUNTIME_INGESTION_CONSUMER,
              sequenceExclusive: cursor,
              limit: 1_000,
            });
            if (page.length === 0) break;
            replayedRows += page.length;
            cursor = page[page.length - 1]!.sequence;
          }
          const wallMs = performance.now() - started;
          // Set only for the unpatched baseline, which unnecessarily replays all rows.
          expect(replayedRows).toBe(Number(process.env.FORKARA_PERF_EXPECT_ORPHAN_REPLAY ?? 0));
          if (sample >= 0) samples.push({ wallMs, replayedRows });
        }
        return { fixtureRows: 10_000, samples };
      }).pipe(
        Effect.provide(ProviderRuntimeEventRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory))),
      ),
    );
    writeFileSync(
      process.env.FORKARA_PERF_OUT ?? "/tmp/forkara-startup-replay.json",
      JSON.stringify({ node: process.version, warmups: 3, ...report }, null, 2),
    );
  },
  120_000,
);
