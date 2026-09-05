# Migration, canary, and rollback governance

This policy governs #174 implementation work. It preserves Forkara's one server, SQLite event-log, and projection architecture; it does not authorize a second database, dual writes, or speculative compatibility machinery.

## Compatibility rules

- Contracts, RPC payloads, commands, events, provider runtime events, automations, and gateway inputs are additive first. New optional fields require safe decode defaults only when the default preserves prior meaning.
- A changed meaning, identity, cardinality, or invariant requires a new field/event/command or explicit schema version. Never guess an old client's intent; reject unsupported client/server combinations with a typed, actionable compatibility error.
- Orchestration events remain decodable for retained history. A new projector starts at a durable cursor, replays the authoritative journal, and records its own progress; snapshots are derived and sequence-fenced against live streams.

## Persistence and repair

- SQLite migrations are additive, transactional, idempotent where replay is possible, and tested with disposable fixtures only. Backup/restore and failed-migration recovery follow the existing migration path; development/test state must remain isolated from normal user state (#158).
- Old/null/legacy rows are handled explicitly in migrations or decoders. Irreversible deletion requires a retained-state compatibility proof and an operator-visible backup/recovery plan.
- Projection repair rebuilds only derived tables under an event high-water fence. It must never issue provider, Git, automation, or delivery side effects; interrupted repairs surface as degraded/recovery-required rather than silently continuing.

## Upgrade dispositions

| State                                                 | Upgrade disposition                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Durable commands/events and projections               | Safe to reconstruct from the event log.                                                                   |
| Provider process/native session                       | Resume only when adapter support and persisted binding allow it; otherwise interrupted/recovery-required. |
| Automation run/claim, approval wait, worktree release | Reconcile from their owning durable service; never reconstruct from UI state.                             |
| Future workflow or validation artifact                | Must declare its disposition before shipping; no universal-resume assumption.                             |

## Canary and rollback

1. Add contracts and read-only diagnostics.
2. Add persistence/projections without changing existing task behavior.
3. Enable a registered flag or canary recipe in a disposable project.
4. Validate replay, repair, in-flight behavior, and rollback.
5. Enable for new tasks first; broaden only after recorded evidence.
6. Retire a legacy path only after retained-state compatibility is proven.

Code-only refactors roll back with code. Additive migrations, event types, and projections roll back by retaining and safely ignoring newer data, not by deleting or reinterpreting it. Provider/environment/handoff/workflow changes must preserve bindings and artifacts for recovery; newer durable records require an operator-visible recovery path.

## Migration PR checklist

- [ ] Contract version/additive-default decision is stated.
- [ ] Migration, backup/restore, legacy-row, and rollback behavior is tested.
- [ ] Event/projector replay and high-water compatibility is proven.
- [ ] In-flight provider, automation, approval, and environment disposition is stated.
- [ ] Canary uses disposable state; rollout is new-tasks-first.
- [ ] Focused tests and unresolved limits are recorded.
