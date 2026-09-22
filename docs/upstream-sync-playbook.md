---
title: Upstream audit and selective sync playbook
---

## Goal

Identify upstream commits that Forkara has not evaluated without merging product code automatically.
Forkara's provider roster, migrations, performance guardrails, identity, and product direction require
curated ports rather than broad merges.

## Audit

```sh
bun run sync:upstream
```

The command fetches `upstream/main`, reads `.github/upstream-sync-state.json`, and reports commits
after `evaluatedUpstreamHead`. It is read-only with respect to tracked files and never creates a
branch, merge, commit, push, or pull request.

Options:

```sh
bun run sync:upstream \
  --base built-from-scratch \
  --upstream main \
  --remote upstream
```

The scheduled `Upstream Audit` workflow runs the same report and publishes it in the workflow
summary. Its token has read-only repository permissions.

## Curated sync

1. Start an isolated worktree and branch from the exact `origin/built-from-scratch` head.
2. Pin the upstream SHA under evaluation and enumerate its commits after `evaluatedUpstreamHead`.
3. Assess each candidate against Forkara's architecture, provider roster, migrations, identity,
   performance priorities, and explicit exclusions.
4. Port selected behavior with Forkara-specific adaptations. Do not merge `upstream/main`.
5. Record accepted SHAs, adaptations, measurements, dependencies, and exclusions in a dated ledger.
6. Advance only `evaluatedUpstreamHead` and `evaluatedAt`. Keep `upstreamHead` and `syncedAt` as the
   last full-sync watermark until an explicitly authorized full sync occurs.
7. Open a normal reviewed PR against `redxzeta/forkara:built-from-scratch` and satisfy its full
   merge-ready gate.

Commits that land upstream after the pinned SHA belong to the next audit. Automation must not
silently expand an in-flight selective-sync PR.
