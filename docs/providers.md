# Providers

Forkara does not host models or sell a separate model subscription. It operates supported
coding-agent runtimes installed and authenticated on your machine, then presents them through one
consistent workspace.

## Supported providers

| Provider      | What Forkara connects to                                     |
| ------------- | ------------------------------------------------------------ |
| Claude Code   | Your installed Claude Code runtime and authenticated account |
| Codex         | Your installed and authenticated Codex CLI                   |
| OpenCode      | Your local OpenCode runtime and configured model providers   |
| Cursor        | Your local Cursor agent runtime and account                  |
| Antigravity   | Your installed and authenticated Antigravity CLI             |
| Grok Build    | Your configured Grok Build runtime and access                |
| Kilo Code     | Your Kilo Code runtime and configured credentials            |
| Pi            | Pi and the model providers configured through it             |
| Factory Droid | Your installed and authenticated Droid runtime               |

Provider availability can differ between the current stable release and development builds. Use the
provider settings in your installed Forkara version as the authoritative list for that build.

## What Forkara manages

Forkara provides the shared operating surface around each provider:

- Project and task ownership
- Provider and model selection
- Conversation and tool activity
- Approvals and user-input requests
- Terminal, browser, file, and diff surfaces
- Git environments and checkpoints
- Session continuation where supported
- Provider handoffs
- Usage information where the provider exposes it

## What remains provider-owned

The provider still controls:

- Installation
- Authentication
- Account and subscription limits
- Model availability
- Tool behavior
- Permission semantics
- Service availability
- Provider-specific session features

A provider working in its own terminal is an important prerequisite, but not a guarantee that every
provider feature is supported through Forkara.

## Connect a provider

1. **Install the official runtime.** Use the provider's official installation instructions.
2. **Authenticate outside Forkara.** Complete the provider's normal sign-in or credential setup.
   Verify the runtime from a fresh terminal.
3. **Open Forkara provider settings.** Confirm that the provider is detected and enabled. When
   necessary, configure a custom path to the provider executable.
4. **Check model discovery.** Open the model picker and confirm that the expected models and options
   appear. Forkara discovers many provider capabilities at runtime; the result can depend on the
   installed CLI version, account, subscription, and provider configuration.
5. **Start a small test task.** Use a harmless objective in a test repository before relying on a
   newly configured provider for important work.

## Models and effort options

Providers expose different selection models:

- A fixed catalog
- A catalog discovered from the installed runtime
- User-configured custom models
- Reasoning, effort, mode, or variant options
- Account-dependent availability

Forkara normalizes these choices into the composer where possible without pretending that every
provider has identical capabilities.

For Codex, successful model discovery determines the built-in choices, including when the returned
catalog is empty. Models absent from that catalog are not re-added from Forkara's static defaults.
Custom models remain available. Until discovery succeeds, Forkara uses its static fallback; a
failed refresh keeps the last successful catalog, and the shared discovery cache refreshes it in
the background after its fresh window.

Favorite models can be surfaced above larger catalogs, and supported provider executables can be
pointed at custom binary locations.

## Provider sessions

Each task owns a provider session.

The session may preserve provider-specific behavior such as:

- Plans
- Tool calls
- Approvals
- Reasoning summaries
- Context usage
- Model changes
- Resume or reconnect behavior
- Provider-native subagents or workflows

Capabilities vary. Do not assume a control available for one provider exists for all of them.

## Switching providers

A provider handoff allows another provider to continue the task and work in the same environment
with the context Forkara passes to it.

Use handoffs deliberately. Review the working tree before and after changing providers so ownership
remains clear.

## When a provider is missing

Check these in order:

1. Does the executable run from a fresh terminal?
2. Is the provider authenticated?
3. Is the expected executable on `PATH`?
4. Is a custom binary path configured incorrectly?
5. Does the installed runtime version support the required integration?
6. Does restarting Forkara refresh the provider status?
7. Does the provider itself report a service or account error?

If the runtime works independently but remains unavailable in Forkara, capture the runtime version,
Forkara version or commit, operating system, and relevant redacted logs in a bug report.

## Codex asynchronous questions

On Codex versions and models that expose `request_user_input_async`, Forkara shows
a question-mark capsule labeled with the number of questions. Opening it reuses
the same question form as blocking prompts: numbered choices, previous/next
navigation, and a separate text answer. Closing the capsule preserves the current
answer draft. A suggested answer is never submitted automatically. The composer
remains available and the agent can continue working while the question is unanswered.

The shared form keeps blocking prompts' existing auto-advance behavior. Async
questions require an explicit submission and scope keyboard shortcuts to the
opened form, so separate questions and the main composer cannot consume each
other's input.

Questions and submitted answers are stored with the assistant message. Refreshing
or restarting Forkara restores that state. Concurrent submissions are admitted once
by the server; a second client refreshes the accepted answer. Normal turn-delivery
errors remain visible on the conversation, as for any other user message.

Rolling back a turn or reverting a checkpoint that removes an answer reopens its
question. Formatted question replies do not offer plain-text edit-and-resend, so
the capsule and the submitted message cannot show different answers. Answer updates
preserve the original assistant message's completion time and turn summary.

### App-server protocol

Verified with codex-cli **0.154.0**, its generated experimental TypeScript schemas,
and an isolated native app-server session:

- `request_user_input_async` is a model-facing tool, not a client RPC. It emits
  `item/started` and `item/completed` for an `agentMessage` with
  `delivery: "async"` and `questions: [{ title, options }]`, and immediately
  returns to the agent. `options` may be null for a free-text-only question.
- The answer is an ordinary user message containing the questions and answers.
  Forkara uses its existing turn dispatch: `turn/steer` with `expectedTurnId` while
  a turn is active, and `turn/start` once the turn has finished. The existing
  dispatch path also handles the turn finishing while the answer is being sent.
- This differs from `item/tool/requestUserInput`, which carries a JSON-RPC request
  ID and uses a response with an answer map. Its `isBlocking` field and deprecated
  `autoResolutionMs` do not define the native asynchronous tool's answer path.
  The inline asynchronous cards never enter Forkara's pending approval/input queues.
- Forkara does not force a model or enable experimental model features. Older
  app-server versions retain their existing text and blocking-question behavior;
  malformed structured questions fall back to the provider's message text.

Scope: native Codex questions in a top-level conversation. Other providers and
subagent question routing are outside this implementation.

Sources: [OpenAI app-server documentation](https://developers.openai.com/codex/app-server),
[upstream asynchronous tool handler](https://github.com/openai/codex/blob/b0d95427c2443e90998f48065902309187564085/codex-rs/core/src/tools/handlers/request_user_input_async.rs).
