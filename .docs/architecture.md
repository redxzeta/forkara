# Forkara architecture

**This is the canonical description of Forkara's current runtime architecture.**
When it disagrees with an older plan, current source, contracts, migrations, and deterministic tests win. It describes present behavior; [roadmap #174](https://github.com/redxzeta/forkara/issues/174) owns agentic-convergence work that is not implemented yet. See [plan status](../.plans/architecture-status.md) before treating a `.plans` document as executable work.

Forkara is a local-first, event-driven modular monolith. It runs one server-authoritative application locally (or under the desktop host), uses SQLite for durable application state, and exposes typed interfaces to the web client, desktop host, automations, external MCP clients, and in-thread agents. It is **not** a collection of microservices and does not require a second workflow engine, event store, workflow database, distributed queue, or replacement provider framework.

## Runtime and dependency direction

```text
Web / Desktop / External MCP / Automation triggers
                         |
                         v
              typed contracts and interface adapters
                         |
                         v
       OrchestrationEngine + SQLite durable event store
                         |
              +----------+----------+
              |          |          |
              v          v          v
        projections   reactors   receipts
                         |
             +-----------+------------+
             |           |            |
             v           v            v
       environments   providers   validation/delivery
                         |
                  ProviderAdapter
                         |
                  provider kernels
```

The diagram names application responsibilities, not new packages. The current paths are:

- `apps/web` renders server-derived projections and keeps browser-only state. `wsTransport.ts` negotiates/reconnects; `wsNativeApi.ts` exposes typed feature APIs.
- `apps/desktop` hosts the shared web client, supervises a desktop-scoped server, and owns Electron/OS lifecycle. It is not a second orchestration implementation.
- `apps/server` contains the application services: WebSocket/HTTP interfaces, orchestration, persistence, automation, provider adapters, Git/worktrees, terminals, workspace files, MCP gateways, and service composition in `src/serverLayers.ts`.
- `packages/contracts` is schema/protocol-only data shared across process boundaries. `packages/shared` contains explicit cross-runtime utilities; neither is an application-state owner.

The intended dependency direction is interface adapters -> application services -> contracts/domain data. The web app does not import server implementation, adapters invoke owning services instead of mutating projection tables directly, and orchestration depends on canonical commands/events/capabilities rather than a concrete provider.

## Current execution paths

### Commands, events, reads, and recovery — implemented

`apps/server/src/wsRpc.ts` is the primary typed feature-RPC boundary; HTTP routes also serve negotiation, static assets, and specialized transports. MCP gateways are separate interface adapters but call the same services.

For a state-changing operation, the path is:

```text
interface adapter
  -> OrchestrationEngine.dispatch(command)
  -> admission, invariant checks, command fingerprint/receipt lookup
  -> durable orchestration event append in SQLite
  -> synchronous/deferred projection work and domain-event publication
  -> reactors for owned side effects
```

`orchestration/Layers/OrchestrationEngine.ts` serializes bounded command admission, rejects identity collisions, and uses `OrchestrationCommandReceipts` to make repeated command IDs replay-safe. `persistence/Services/OrchestrationEventStore.ts` owns append/replay. `ProjectionPipeline.ts` derives projection tables from the event journal; `ProjectionSnapshotQuery.ts` is the read owner for snapshots. `repairState()` rebuilds derived projections under a durable event high-water fence and restores staged projections on failure. A projection is therefore a derived read model, not competing durable business truth.

The in-memory command read model and live event/pubsub streams are runtime caches/transport aids. A restart must recover from SQLite events and projections, not from a browser store or provider callback.

### Provider work — implemented

Provider-facing commands become effects through `ProviderCommandReactor.ts`. `provider/Layers/ProviderService.ts` resolves the thread/provider binding and routes to `ProviderAdapterRegistry.ts`; concrete native protocols stay behind `provider/Services/ProviderAdapter.ts`. Adapters normalize output into `ProviderRuntimeEvent`; `ProviderRuntimeIngestion.ts` turns those canonical events back into orchestration commands/events. Native frames do not mutate orchestration directly.

`ProviderSessionRuntime` persists the thread-keyed provider binding, adapter key, runtime mode, lifecycle generation, and opaque resume/runtime payload. It is durable Forkara metadata, not a claim that a provider child process is still alive. Processes, native session objects, cursors, and wire-protocol state remain adapter/provider-native state and are reconciled on startup. See [provider architecture](./provider-architecture.md) for the registered providers and protocol families.

### Automations — implemented with a bounded gap

`automation/Layers/AutomationService.ts` and `persistence/Layers/AutomationRepository.ts` own durable definitions, schedules, permission snapshots, run records, claims, deferred execution, completion accounting, and reconciliation. `AutomationScheduler.ts` calculates the next wakeup from the durable next-run value, reconciles active runs, then claims due work; `AutomationRunReactor.ts` also reconciles runs when relevant orchestration events arrive and recovers pending runs after restart.

Automation dispatches normal orchestration commands. It does not introduce another command bus or task store. Automation modes explicitly distinguish a continued target thread from an automation-owned thread. Current definitions persist retry policy data, but executable generalized retry policies are deliberately rejected except for `none`; durable multi-attempt retry semantics are future work under #174. Today, separately created runs keep their own IDs and prior outcomes rather than overwriting them.

### MCP and agent gateway — implemented

`externalMcp/Layers/ExternalMcpGateway.ts` serves scoped loopback external MCP access. `ExternalMcpService` and `ExternalMcpRepository` own hashed credentials, integration/project scope, capability grants, audit records, request idempotency, and task-capacity limits. The gateway creates or reads work only by calling existing orchestration, projection, provider, Git, and operation services.

`agentGateway/Layers/AgentGateway.ts` is the internal MCP tool surface injected into provider sessions. Its bearer token and operations are thread/caller scoped. It uses the same application services and prevents a caller from driving a more privileged runtime mode or an incompatible shared-checkout target. Neither gateway becomes an independent orchestration authority.

### Local resources and evidence — implemented

`git/Layers/GitCore.ts` owns Git operations and managed-worktree primitives; a task/thread's projected environment fields identify its selected local checkout or worktree. `checkpointing/Layers/CheckpointStore.ts` owns hidden Git-ref capture, restore, and diff mechanics, while orchestration events/projections carry user-facing checkpoint metadata. `terminal` owns live terminal processes; `workspace` owns bounded filesystem operations and attachment handling. These processes/files are local resources, not SQLite projections.

Runtime receipts such as checkpoint/diff/turn-quiescence completion flow through `RuntimeReceiptBus`; delivery and validation side effects must produce identity-bound evidence rather than rely on an agent's assertion. Forkara does not currently provide the complete durable multi-stage validation/delivery workflow described by #174.

## State ownership matrix

| State category                                                                                                                     | Authoritative owner                                                                             | State class and boundary                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects, threads/tasks, turns, messages, goals, and current workflow-like lifecycle                                               | Orchestration event store through `OrchestrationEngine`                                         | Durable event truth in SQLite; projection rows and snapshots are derived. A first-class durable workflow aggregate is planned under #174.                                                                                             |
| Automation definitions, schedules, due calculation, run claims, permission snapshots, misfire handling, run outcomes, and recovery | `AutomationService` + `AutomationRepository`                                                    | Durable SQLite automation state. Scheduler/reactor are runtime executors and reconciliation mechanisms, not separate authorities. General retry execution is planned/partial as described above.                                      |
| Provider-native processes, session objects, native IDs/cursors, and protocols                                                      | Concrete `ProviderAdapter` / provider kernel                                                    | Provider-native/runtime state. The server retains only an opaque, thread-keyed durable binding needed for recovery.                                                                                                                   |
| Durable thread/provider binding                                                                                                    | `ProviderSessionRuntimeRepository`                                                              | Durable Forkara compatibility/recovery metadata keyed by thread; `ProjectionThreadSessions` is a derived projection of session status.                                                                                                |
| Task environment and managed worktree selection                                                                                    | Orchestration events/projections plus `GitCore` operations                                      | Durable selected environment metadata is server-owned; the mutable checkout/worktree on disk is the actual resource. Stronger task-exclusive environment ownership/recovery is planned under #174.                                    |
| Git state and checkpoints                                                                                                          | Git repository and hidden refs via `GitCore`/`CheckpointStore`                                  | External/local resource truth. Checkpoint catalog/activity visible to Forkara is durable event/projection metadata, not a substitute for Git refs.                                                                                    |
| Validation and delivery evidence                                                                                                   | Owning side-effect service; `OrchestrationEventDeliveryRepository` for durable delivery records | `RuntimeReceiptBus` is a transient runtime receipt, while durable event-delivery records record delivery state. A model completion message is not validation; full identity-bound validation/delivery evidence is planned under #174. |
| Server-derived shell, thread-detail, activity, session, and snapshot views                                                         | `ProjectionPipeline` / projection tables                                                        | Derived projections, rebuildable from the orchestration event store; in-memory read model is a cache/compatibility aid.                                                                                                               |
| Client drafts, sticky local model choices, dock/layout state                                                                       | `apps/web` browser storage and UI stores                                                        | Client-only state. It survives a browser reload by local persistence but is not server orchestration truth.                                                                                                                           |
| External MCP credentials, scopes, idempotency, audit, and task limits                                                              | `ExternalMcpService` + `ExternalMcpRepository`                                                  | Durable server-owned external-integration state; raw pairing/credential material is not stored as application-readable truth.                                                                                                         |
| Internal gateway caller-turn capabilities                                                                                          | Injected `AgentGatewayCredentials` and gateway policy                                           | Scoped capability/compatibility state tied to the caller context; durable operation records support recovery, but no gateway grants global authority.                                                                                 |

## Agentic architecture rules

These are current invariants where the corresponding mechanism exists and binding design rules for #174 where it does not yet:

1. Workflow recipes must compile to existing orchestration commands/events; workflow state must not live in a second engine or database.
2. Provider/model output becomes durable task state only through canonical adapter normalization and `ProviderRuntimeIngestion`.
3. Validation evidence and receipts outrank a model's claim that work is complete.
4. Provider, model, runtime mode, environment, branch, and capability changes must be explicit in commands, bindings, or durable context—not silent fallback.
5. Parallel mutable work requires isolated environment ownership. Today worktree selection exists; enforcing durable task-exclusive ownership is #174 work.
6. Retries must create distinct attempts and retain previous failures. Existing automation runs preserve outcomes; general retry execution remains planned.
7. Provider fallback must be visible. Orchestration must use capabilities and canonical events, while provider-native behavior stays behind `ProviderAdapter`.
8. High-impact actions remain approval- and capability-scoped. External MCP and internal gateway scopes cannot bypass normal service admission.
9. Private model chain-of-thought is neither required nor persisted. Store bounded structured results, diagnostics, receipts, and concise handoff/validation evidence instead.
10. UI surfaces consume projections and evidence. They do not reconstruct or mutate durable authority independently.

## Current, partial, planned, and out of scope

| Area                                                                                                                                                                                                                        | Status                                                               | Boundary                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Server-authoritative commands, durable events/receipts, projections, replay/repair, and provider-reactor ingestion                                                                                                          | Implemented                                                          | Existing `apps/server/src/orchestration` and SQLite layers.                              |
| Adapter registry, capability-driven provider operations, Codex implementation, ACP family, and OpenCode-compatible family                                                                                                   | Implemented                                                          | Provider-native lifecycle remains inside adapters; exact inventory is the live registry. |
| Durable automation scheduling, claims, permission snapshots, misfire handling, and recovery                                                                                                                                 | Implemented                                                          | Existing automation service/repository/scheduler/reactor.                                |
| Explicit task-exclusive environments, full provider lifecycle kernel decomposition, identity-bound validation/delivery, registered durable workflows, generalized retries, bounded workflow concurrency/cancellation/canary | Planned under [#174](https://github.com/redxzeta/forkara/issues/174) | Follow its staged child epics; do not infer implementation from this document.           |
| Retry-policy persistence and enforcement of mutable-work isolation                                                                                                                                                          | Partially implemented                                                | Current data/selection exist; the broader execution/ownership contract is not complete.  |
| Microservices, Redis, Kafka, RabbitMQ, Temporal, distributed queues, a second event store/workflow database, replacement provider framework, broad directory rewrite, or generic cross-project agent SDK                    | Intentionally out of scope                                           | These are not implied implementation options for Forkara.                                |

## Related documents

- [Provider architecture](./provider-architecture.md) — adapter contract, registry, capabilities, and provider-family detail.
- [Transport](./transport.md) — WebSocket negotiation, compatibility, compression, and replay-safe subscriptions.
- [Runtime modes](./runtime-modes.md) — provider permission-mode mappings.
- [Workspace layout](./workspace-layout.md) — workspace ownership map.
- [State-ownership executable evidence](./ownership-evidence.md) — owner, representation class, and focused regression coverage.
- [Migration governance](./migration-governance.md) — compatibility, projection repair, canary, and rollback rules for #174 work.
- [Historical plan status](../.plans/architecture-status.md) — disposition of plans that make architecture claims.
