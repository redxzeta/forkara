# Architecture plan status

This index prevents historical plans from competing with the [canonical architecture](../.docs/architecture.md). A status says whether a plan remains useful as history; it does not authorize implementation. Current source, contracts, migrations, and deterministic tests remain authoritative.

| Plan | Status | Current interpretation |
| --- | --- | --- |
| `03-split-codex-app-server-manager.md` | Superseded | It names an obsolete desktop `CodexAppServerManager` path. Current provider ownership is server-side behind `ProviderAdapter`. |
| `06-provider-logstream-lifecycle.md` | Superseded | It targets the retired desktop `ProviderManager`; provider lifecycle now belongs to server adapters/services. |
| `09-event-state-test-expansion.md` | Superseded | It refers to the former renderer paths; orchestration/transport tests now live under `apps/server/src/orchestration` and `apps/web`. |
| `10-unify-process-session-abstraction.md` | Historical reference only | A desktop-process refactor proposal, not the current provider/session boundary. |
| `11-effect.md` | Partially relevant | It records the migration toward service contracts and layers. Do not use its legacy-manager paths as current architecture. |
| `12-effect-new.md` | Superseded | Its stated production legacy-stack assumptions no longer describe the current server composition. |
| `13-provider-service-integration-tests.md` | Historical reference only | Useful test-design history; checkpoint/session ownership must be verified against current reactor and persistence code. |
| `14-server-authoritative-event-sourcing-cleanup.md` | Partially relevant | Its direction (command/event/projection/provider separation) is implemented, but its proposed routers, paths, and remaining tasks are not an active blueprint. |
| `15-effect-server.md` | Historical reference only | A broad migration note, not a current directory or dependency contract. |
| `17-claude-agent.md` | Partially relevant | Its canonical-ingestion/provider-adapter rules remain useful; provider availability and implementation claims must come from the live registry and adapter tests. |
| `17-provider-neutral-runtime-determinism.md` | Implemented | Its recorded runtime-determinism work is historical evidence; source and tests define the maintained behavior. |
| `branch-environment-picker-in-chatview-input.md`, `git-integration-branch-picker-worktrees.md` | Historical reference only | UI/path proposals; current environment selection and Git ownership are documented in the canonical architecture and source. |
| `01`, `02`, `04`, `05`, `07`, `08`, `16*`, `SYN-47`, `git-*`, `github-issues-prs-feature`, `profile-*`, and `spec-*` plans | Historical reference only | Retained context. They do not make an active current-architecture claim unless current source independently confirms it. |

Roadmap work for durable agent workflows, provider-kernel convergence, task-owned environments, validation evidence, and migration governance is explicitly owned by [#174](https://github.com/redxzeta/forkara/issues/174). Do not create a second workflow engine, event store, persistent workflow database, distributed queue, or provider framework while pursuing it.
