# Development and testing

This guide is the shortest path from a fresh fork to a reviewable Forkara change.

## Requirements

- [Bun](https://bun.sh/) 1.3.9 or newer in the 1.x line. The repository currently pins Bun 1.3.12.
- [Node.js](https://nodejs.org/) 24.13.1 or a compatible 24.x release.
- Git and a supported desktop operating system.

The versions in the root [`package.json`](../package.json) are authoritative when this guide and the
toolchain differ.

## Fork and clone

Fork `redxzeta/forkara` on GitHub, then clone your fork and add the canonical repository as
`upstream`:

```console
git clone git@github.com:YOUR-USER/forkara.git
cd forkara
git remote add upstream https://github.com/redxzeta/forkara.git
git fetch upstream built-from-scratch
git switch -c your-branch upstream/built-from-scratch
bun install --frozen-lockfile
```

Open pull requests against `redxzeta/forkara:built-from-scratch`, not `main`.

## Start an isolated contributor instance

```console
bun run dev:contributor
```

This mode uses `./.forkara/contributor` for application state, starts from server port 6931 and web
port 8891, advances to another free port pair when needed, and ignores an inherited
`FORKARA_AUTH_TOKEN`. The `FORKARA_*` names are retained runtime compatibility identifiers.

Inspect the resolved setup without starting Turbo or any application process:

```console
bun run dev:contributor -- --dry-run
```

The repository-local state directory is ignored by Git. The ordinary `bun run dev` and its existing
flags remain available for maintainers and custom setups, but contributor mode is the safe default
when an installed Forkara instance may already be open.

## Repository architecture

- `apps/server` — Node.js WebSocket server, provider processes, persistence, and orchestration.
- `apps/web` — React/Vite interface, event rendering, and client-side state.
- `apps/desktop` — desktop packaging and native lifecycle integration.
- `apps/marketing` — product website.
- `packages/contracts` — schemas and shared protocol contracts; keep this package schema-only.
- `packages/shared` — runtime utilities shared by server and web through explicit subpath exports.
- `scripts` — development, validation, migration, canary, and release tooling.

Search for an existing utility or nearby convention before introducing another abstraction. Changes
to provider lifecycle, reconnect behavior, transcript scrolling, persistence, or migrations need
focused regression coverage because failures in those paths can surface after a restart.

## Provider requirements

Live provider credentials are optional for UI work, documentation, builds, and ordinary unit tests.
Mocks and bounded test seams cover those workflows. Install and authenticate the relevant provider
runtime only when your change requires a real agent session or live provider integration testing.

Never put credentials in fixtures, screenshots, logs, or pull-request descriptions.

## Focused verification

Run the smallest relevant checks while iterating. Examples from the repository root:

```console
# Contributor runner
bun run --cwd scripts test dev-runner.test.ts

# One web test file; the path is relative to apps/web
bun run test:web:focused src/path/to/example.test.ts

# One server test file
bun run --cwd apps/server test src/path/to/example.test.ts
```

Use `bun run test`, never `bun test`, for the complete Vitest workspace.

Before handing off a completed change, run the repository-required final checks:

```console
bun run fmt
bun run lint
bun run typecheck
bun run test
```

CI also builds the desktop pipeline, runs stable browser coverage, tests Windows process and
migration recovery behavior, verifies migration lineage, and exercises release-only steps. The four
always-running required jobs are:

- `Format, Lint, Typecheck, Test, Browser Test, Build`
- `Windows Process Regression`
- `Migration Lineage`
- `Release Smoke`

## UI evidence

For visual changes, attach clear before/after screenshots using the same theme, window size, and
state. For motion, timing, keyboard flow, drag/drop, or other interaction changes, include a short
recording. Note any state that cannot be shown safely and redact repository names, tokens, account
details, and private conversation content.

## Pull-request scope

Small bugs, tests, and documentation improvements can be submitted directly. Get an issue accepted
before starting a feature, architectural change, or likely `size:L` or larger change. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md) for claiming work, monthly triage, and review expectations.
