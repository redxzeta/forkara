# Forkara

Forkara is a free, open-source, local-first desktop workspace and control plane for coding agents.
It brings provider sessions, tasks, terminals, browser work, diffs, Git worktrees, handoffs,
automations, and pull-request delivery into one application. Your repositories and workspace data
stay on your machine, and Forkara uses the provider accounts you already have.

Forkara is early-stage software. APIs and interface details are still evolving.

![Forkara workspace with agent task, terminal, and project navigation](assets/prod/readme-screenshot.jpeg)

## What Forkara does

### Projects, threads, and context

Projects define the workspace; threads preserve task-specific conversations, state, files, and
history.

- **Multi-provider workspace** — use Claude Code, Codex, OpenCode, Cursor, Antigravity, Grok Build,
  Kilo Code, Pi, and Factory Droid from one app.
- **Parallel agents** — run tasks in isolated Git worktrees and watch native subagents and workflows
  with live phases and pause/stop controls.
- **Plan and Debug modes** — ask an agent to propose before executing or use an evidence-first debug
  loop without changing runtime permissions.
- **Persistent thread goals** — attach a multi-turn objective with pause/resume, achievement history,
  and bounded autonomous continuation.

### Integrated workspace tools

| Surface            | Purpose                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Changes**        | Inspect diffs, changed files, and review state.                                                                         |
| **Terminal**       | Run commands in the project environment.                                                                                |
| **Browser**        | Keep local previews and the in-chat browser next to the thread, with semantic or page-declared WebMCP tools for agents. |
| **Files / Editor** | Browse, inspect, and edit project files in context.                                                                     |
| **Git**            | Work with branches, commits, pushes, and pull requests.                                                                 |

Split views, browser previews, and device previews keep execution and verification connected to the
task that produced them.

### Handoffs, delivery, and external MCP

Forkara is an MCP-native agent harness in two directions: supported agents running inside Forkara
receive tools to coordinate tasks and automations, while Codex, Claude, and other local MCP clients
can connect through a scoped integration.

- **Handoffs and orchestration** — continue a task with another provider, or schedule recurring
  agent runs with automations.
- **Review and delivery** — inspect diffs, verify in the browser, commit, push, open pull requests,
  and review or merge without leaving the app.
- **External MCP** — pair local MCP clients through a scoped, revocable integration. See
  [External MCP integrations](docs/external-mcp.md) for setup and permission boundaries.

## Installation

Download the desktop app from [Forkara Releases](https://github.com/redxzeta/forkara/releases).

To run the current source as a contributor:

```console
git clone https://github.com/redxzeta/forkara.git
cd forkara
bun install --frozen-lockfile
bun run dev:contributor
```

Contributor mode uses repository-local data and non-default ports, so it can run beside an installed
Forkara app. Try the setup without starting services with
`bun run dev:contributor -- --dry-run`.

Provider credentials are optional for ordinary UI and unit-test work. Install and authenticate a
supported provider only when you need to start a real agent session or test a live provider
integration. Forkara does not include a model subscription; provider authentication, model access,
and usage limits remain with that provider.

See the [development guide](docs/development.md) for supported tool versions, repository structure,
focused tests, and the pull-request base branch.

## Documentation

- [Quickstart](docs/quickstart.md)
- [Core concepts](docs/core-concepts.md)
- [Providers](docs/providers.md)
- [External MCP integrations](docs/external-mcp.md)
- [Canonical architecture](.docs/architecture.md) — current runtime boundaries, state ownership, and #174 migration scope
- [X integration](docs/x-integration.md)
- [Development and testing](docs/development.md)
- [Downstream rebrand guide](docs/rebrand-checklist.md)

## Privacy

Forkara runs as the workspace layer on your machine. There is no Forkara cloud holding your
repositories, chats, or project history. Provider traffic goes directly to the provider you choose.

## Contributing

Focused contributions are welcome. Small bug fixes, tests, and documentation changes can be opened
directly. Please start with an accepted issue before building a feature, architectural change, or
other likely `size:L` work.

Current contributor-ready work:

- [`good first issue`: #145](https://github.com/redxzeta/forkara/issues/145) — restore a visible
  keyboard focus indicator for message actions.
- [`help wanted`: #146](https://github.com/redxzeta/forkara/issues/146) — remove runtime Google Fonts
  requests.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the issue-claim and review process. Ask support questions
in [GitHub Discussions](https://github.com/redxzeta/forkara/discussions/categories/q-a), and report
security concerns privately as described in [SECURITY.md](SECURITY.md).

## Origins

Forkara began as a clone of [T3Code](https://github.com/pingdotgg/t3code), but it has since become a substantially different product with its own branding, packaging, release system, provider orchestration, desktop app behavior, and product direction.

## License

Forkara is licensed under the [MIT License](LICENSE).
