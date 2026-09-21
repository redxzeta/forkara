# Selective Synara quality backport — September 20, 2026

Target: `redxzeta/forkara:built-from-scratch`, based on
`d2f9a24e93e3ea561c97c9d7fa724f713773ba1d`.

Source snapshot: Synara `b58f27381e7ddd59678c9961500e8e43d3cc19ab`, exactly 220 commits
after the previously evaluated snapshot `8599826d75d9932e69c301f2441f585da8f211e2`.
The snapshot was evaluated on September 21, 2026. A projected direct merge had 324 conflicts, so
this change ports selected behavior and does not merge `upstream/main`.

The full-sync watermark remains `a8a7a5eae3a77de21988088f67e97eccf73eaaad` with its original
`syncedAt`. `evaluatedUpstreamHead` records the newer review boundary without claiming a full sync.
Commits after the pinned snapshot belong to the next audit.
The post-change audit observed two such commits at `e7cd15281e6d16cf8fc55a91496dcff035475e54`:
`4a886e94711c` (delegated gateway task results) and `e7cd15281e6d` (macOS icon persistence).
They are recorded here and intentionally not added to this PR.

## Accepted upstream changes

| Upstream SHA | Forkara commit           | Accepted behavior and Forkara adaptation                                                                                                                                                                                                                |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a355cf200`  | `601cdf32f`, `d07eca582` | Extracted focused `ChatView` hooks and components, then completed Forkara-specific composer, reference, interaction, transcript, queue, provider, recovery, and environment wiring. Preserved the simpler transcript path and shared disclosure motion. |
| `738a3ce71`  | `0282c50bd`              | Kept orchestration dispatch responsive under slow subscribers.                                                                                                                                                                                          |
| `5d068e088`  | `4169b5ffb`              | Tied desktop backend lifetime to its parent and made teardown deterministic.                                                                                                                                                                            |
| `d476614a1`  | `2f45199f9`              | Made stuck provider starts recoverable through the existing stop path.                                                                                                                                                                                  |
| `4d45200e4`  | `09a6934a1`              | Rejected invalid signals and captured process identities before teardown.                                                                                                                                                                               |
| `d3f6b1b67`  | `8605bfab3`              | Reduced status-animation and hidden-page timer work.                                                                                                                                                                                                    |
| `3b021c681`  | `1b009af27`              | Separated transcript message and geometry signals for tail anchoring.                                                                                                                                                                                   |
| `e0b052848`  | `322e4f349`              | Prevented stalled smooth-stream reveal frames and hidden presentation ticks.                                                                                                                                                                            |
| `35fe7e31d`  | `730369612`              | Cached GitHub pull-request lookups and corrected badge polling/status behavior.                                                                                                                                                                         |
| `ff1e6ea9e`  | `76afa85a4`              | Corrected Codex model discovery while retaining Forkara's hard-coded defaults and starred presets.                                                                                                                                                      |
| `1fa364e9c`  | `8f318ab0a`              | Added chunked assistant-text persistence and bounded provider cleanup. Introduced migration 098.                                                                                                                                                        |
| `a30dc14ff`  | `b104e5cfe`              | Removed the fixed per-delta streamed-text write cost.                                                                                                                                                                                                   |
| `93fb8975b`  | `d15832404`              | Filled missing message order once and coalesced live journal drains.                                                                                                                                                                                    |
| `95b3101c2`  | `e0467aefe`              | Prevented acknowledgement retries from duplicating buffered runtime output.                                                                                                                                                                             |
| `2d05ebf0a`  | `a25fcfe89`              | Kept Codex Markdown intact across streamed text segments.                                                                                                                                                                                               |
| `3d71dcee8`  | `1f1d29c3a`              | Reconciled duplicate approval responses without a second state owner.                                                                                                                                                                                   |
| `d8de97cbc`  | `ad5520e2e`              | Added provider-neutral asynchronous question contracts, Codex adapters, non-blocking cards, and migration 101.                                                                                                                                          |
| `53668e185`  | `702353016`              | Preserved Codex tool calls after steering.                                                                                                                                                                                                              |
| `c317f5949`  | `c9250166c`              | Corrected Claude token accounting and added migration 100.                                                                                                                                                                                              |
| `3a0d491df`  | `91cedc1d9`              | Required exact provider targets for agent-authored automations.                                                                                                                                                                                         |
| `cce61948a`  | `c69d761aa`              | Ordered projected activity by the latest human message; adapted upstream migration identity to Forkara migration 102.                                                                                                                                   |
| `58820cb2a`  | `90192230b`              | Updated the shared OpenCode runtime/server metadata path. Applied it to both OpenCode and retained Kilo; no provider migration was introduced.                                                                                                          |
| `fd309cb8d`  | `a95fa6482`              | Represented Pi auto-retry as inline warnings and kept End responsive.                                                                                                                                                                                   |
| `16f63051c`  | `6c4f5ecc1`              | Kept Pi extension status out of the tool timeline.                                                                                                                                                                                                      |
| `48699c1e7`  | `1dca6abf1`              | Queued Pi mid-turn sends as follow-ups.                                                                                                                                                                                                                 |
| `91e454b62`  | `61a723fcf`              | Preserved Antigravity output and terminal states.                                                                                                                                                                                                       |
| `c9c09b0a8`  | `cbe520493`, `4496e2348` | Registered Antigravity background tasks before stop and adapted capture tests to Forkara identity.                                                                                                                                                      |
| `4bb3dccfa`  | `a2e968af9`              | Allowed retry after confirmed Codex startup failures.                                                                                                                                                                                                   |
| `bbfcd9387`  | `7b9f328e3`              | Corrected provider usage and native fork resumes.                                                                                                                                                                                                       |
| `4457f5f40`  | `913ac8b7a`              | Fixed Codex fast-mode reset and duplicate skill input.                                                                                                                                                                                                  |
| `c680c24b2`  | `fe2bef603`              | Recovered pending Claude questions after restarts and expired sessions.                                                                                                                                                                                 |
| `e895fea86`  | `7d894b210`              | Settled the Claude runtime before publishing turn completion.                                                                                                                                                                                           |
| `0e44fd59d`  | `24e67f75c`              | Centralized model display-name humanization for the existing Forkara roster; Devin was not added.                                                                                                                                                       |

Follow-up Forkara-only commits are part of the same integration: `d15832404`, `4496e2348`, and
`d07eca582` carry ordering, identity, and extraction adaptations that cannot be applied as literal
upstream patches.

## Architecture and migration safety

- The orchestration event store remains the only state owner. Projections, asynchronous interaction
  recovery, journal acknowledgements, and provider adapters derive from it; no workflow engine,
  second database, or provider framework was added.
- Released migration 097 is unchanged. This branch appends:
  `098_MessageTextChunks`, `099_ProjectionThreadMessagesTurnBoundary`,
  `100_ClaudeTokenAccounting`, `101_AsyncUserInput`, and
  `102_ProjectionThreadsHumanMessage`.
- Provider-native question payloads terminate at adapters. Contracts and persisted responses use the
  canonical provider-neutral asynchronous user-input schema.
- Kilo remains in the provider enum, UI bindings, discovery behavior, and tests. Shared
  OpenCode-family changes apply to Kilo and OpenCode. Devin is absent.
- New behavior depends on the existing event store, projection replay, runtime journal,
  provider-service lifecycle, React transcript pipeline, and shared disclosure-motion utilities. No
  new production dependency or state service was introduced.

## Measured performance

All values below are five-sample medians from paired, sequential runs on the same Linux x64 host and
Chromium 145 runtime. Both revisions used production-mode builds and identical deterministic input.
Raw samples were written to disposable `/tmp` artifacts and were not committed.

### Streaming persistence

Workload: one thread, 40,000 assistant-text bytes in 1,000 40-byte dispatches, fresh SQLite database,
WAL autocheckpoint disabled during measurement. Both revisions reconstructed exactly 40,000 `x`
characters before and after completion; SHA-256
`6285332e3072b27e5b095c5c7d6e37eadd201220eb14694f9d2d0177c25a64ae`.

| Metric                  |        Base |      Branch |  Change |
| ----------------------- | ----------: | ----------: | ------: |
| Streaming WAL bytes     | 119,471,792 |  66,509,192 | -44.33% |
| Final WAL bytes         | 119,603,632 |  66,842,912 | -44.11% |
| Stream dispatch time    | 1,983.51 ms | 2,055.70 ms |  +3.64% |
| Streaming snapshot read |     6.80 ms |    12.18 ms | +79.16% |
| Completion dispatch     |     8.82 ms |    13.00 ms | +47.45% |

The last two percentages are large on small absolute timings and are recorded rather than described
as improvements. The acceptance metric, median WAL, improves substantially; stream dispatch remains
inside 5%.

### Transcript pipeline

Workload: 200 retained messages, 80 fixed batches, 80 text characters per batch, and two activity
events every fifth batch at a 30 ms cadence. Every sample produced exactly 6,400 bytes, reported
`finalTextMatches=true`, and had SHA-256
`235066301aa1aa0558ef9b42ac00793fd9b601e90a2c67ef0566d4b0d535b677`.

| Metric                         |        Base |      Branch | Change |
| ------------------------------ | ----------: | ----------: | -----: |
| Chromium main-thread task time | 2,746.91 ms | 2,705.46 ms | -1.51% |
| React commit count             |         380 |         382 | +0.53% |
| React commit duration          | 1,391.50 ms | 1,342.70 ms | -3.51% |

The required WAL, main-thread-time, and React-commit-count medians do not regress by more than 5%.
No claim is made for an unmeasured workload.

## Explicitly deferred

- BetterWright and saved browser credentials.
- Project import and Claude Artifacts.
- Writable editor/diff redesign and first-run onboarding.
- Claude cache-hold review policy.
- Transcript-marker deletion.
- Devin introduction or a Devin/Kilo migration.
- Model-picker restyling.
- Synara icons, marketing, release/version changes, and broad visual redesigns.
- Deployment, release, runtime activation, and any automatic broad upstream merge.

## Verification record

Focused orchestration, provider, interaction, ordering, model-discovery, work-log, and `ChatView`
checks passed during integration. The final exact-head command inventory, browser totals, desktop
build, migration replay/recovery evidence, self-review resolutions, and CI result are recorded in the
pull request. Intermediate commits and this ledger alone do not establish merge readiness.
