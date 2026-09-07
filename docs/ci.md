# PR validation

CI keeps the four existing required contexts. Repository protection does not need
changes:

- `Format, Lint, Typecheck, Test, Browser Test, Build` is an aggregate gate over
  `Format, Lint, Typecheck, Architecture`, `Unit Tests and Desktop Build`, and
  `Browser Tests`. Static validation includes focused CI-selection and architecture
  tests; unit tests always run. The gate rejects failures, cancellations, missing
  scope output, and unexpected skips.
- `Windows Process Regression`, `Migration Lineage`, and `Release Smoke` always
  run with their existing coverage.

After static validation, unit/build and browser jobs run independently. Each job
and named step has its own duration and failure log in Actions. The static job's
summary reports the selected scope. The existing Linux geometry quarantine remains
advisory; stable browser failures block the aggregate gate.

## Selection and full fallback

Only PRs consisting entirely of root Markdown files, Markdown under `docs/`,
`.docs/`, `.plans/`, `plans/`, `advisor-plans/`, or `audit/`, and/or the two
`scripts/check-architecture-boundaries{,.test}.ts` files skip browser validation
and the explicit desktop build/preload check. Unit tests retain their existing
Turbo prerequisite builds. This is a narrow non-runtime allowlist, not a mapping
of every package dependency. Other scripts, app-local Markdown, CI configuration,
manifests, lockfiles, patches, runtime changes, and unknown paths run everything.

`scripts/ci-scope.ts` compares the PR merge base and head using a full Git checkout.
It includes deleted paths and both sides of renames, uses NUL-separated names,
and has no GitHub changed-files API limit. Empty or unavailable diffs select full
validation. Selection tests cover mixed paths, unknown paths, events, and a move
from runtime into docs alongside more than 300 changed files. Changes to the
selector or workflow themselves select full validation.

Every push to `built-from-scratch`, the Monday 06:00 UTC schedule, and manual
**Actions → CI → Run workflow** run full validation. Select a PR branch for a
manual full run when investigating a skipped suite. The schedule becomes active
when this workflow lands on the default branch. These runs only validate; release
publication and the existing macOS device-helper workflow remain separate.

## Timing evidence

Measured on hosted runners before this change:

| PR run                                                                    | Linux quality | Typecheck | Unit tests | Stable browser | Geometry | Desktop build |
| ------------------------------------------------------------------------- | ------------: | --------: | ---------: | -------------: | -------: | ------------: |
| [#190](https://github.com/redxzeta/forkara/actions/runs/33909586817)      |        22m06s |     2m18s |      6m13s |          9m03s |    3m35s |            1s |
| [Docs #193](https://github.com/redxzeta/forkara/actions/runs/33984150439) |        18m50s |     1m51s |      5m26s |          7m33s |    2m59s |            1s |

Browser execution dominates the serial tail; desktop build is already cheap in
these warm-cache runs. Docs PR #193 spent 18s installing Linux dependencies and
3m43s in the separate Windows job. Removing browser work from that docs run would
remove 10m47s (including browser installation), before accounting for the new job
setup and queue time. This is a projection, not an observed speedup. PR #190 also
changed the workflow and manifest, so it would correctly select full validation.

The split reuses the existing Bun/Turbo and browser/Electron caches. It adds two
Linux dependency installs on full runs (one on narrow runs); no install-artifact
pipeline or custom scheduler is needed. Unit tests and desktop build stay together
to reuse Turbo's prerequisite outputs. Compare job and whole-run elapsed times
separately, noting changed paths, cache state, and runner queueing before attributing
future differences to this change.
