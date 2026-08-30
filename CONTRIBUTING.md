# Contributing to Forkara

Thanks for considering a contribution. Forkara is maintained in limited spare time, so the project
uses a focused, issue-first workflow to make review sustainable and to avoid asking contributors to
build work that does not fit the roadmap.

## Choose suitable work

You may open a pull request directly for a small bug fix, test improvement, or documentation change.
Features, architectural changes, and work likely to receive a `size:L` or larger label need an issue
accepted by the maintainer before implementation starts. Unsolicited roadmap-scale pull requests
will be closed so contributor and review time can stay focused on agreed work.

Only `good first issue` and `help wanted` issues with concrete acceptance criteria and available
review capacity are advertised as contributor-ready. To claim one, comment on the issue before
starting. A claim expires after 30 days without a progress update, after which someone else may
claim it.

The maintainer reviews the contribution queue in monthly batches. Replies may arrive earlier when
time permits, but there is no faster response guarantee.

Use [GitHub Discussions](https://github.com/redxzeta/forkara/discussions/categories/q-a) for setup
and support questions. Issues should stay focused on reproducible bugs, scoped improvements, and
documentation gaps. Never report a vulnerability publicly; follow [SECURITY.md](SECURITY.md).

## Before you code

Read the [development guide](docs/development.md). It covers the supported Bun and Node versions,
fork setup, repository architecture, the isolated contributor server, provider requirements, and
focused verification commands.

Pull requests must target `redxzeta/forkara:built-from-scratch`. Keep each pull request focused on
one agreed outcome and avoid mixing unrelated cleanup into the change.

## Prepare the pull request

Include:

- the linked issue, or a short explanation of why the change is eligible for direct submission;
- a clear summary of the implementation;
- the exact commands and manual checks you ran;
- compatibility or migration risks, especially around sessions, reconnects, persisted data, and
  provider behavior; and
- before/after screenshots for visual changes, plus a short recording for motion or interaction
  changes.

CI runs workspace quality/build, Windows process regression, migration lineage, and release-smoke
jobs. A pull request is ready to merge only when the required jobs pass and review conversations are
resolved. GitHub may require approval before workflows run for a first-time contributor.

## Review expectations

Review may ask you to narrow the scope, add evidence, preserve compatibility, or split unrelated
changes. The maintainer makes the final product and architecture decisions and may decline work that
no longer fits, even after an issue was discussed. When that happens, the review will explain the
reason directly.

For upstream refresh pull requests, follow the
[upstream sync playbook](docs/upstream-sync-playbook.md) and target `built-from-scratch`.
