import "../index.css";

import {
  DEFAULT_SERVER_SETTINGS_VIEW,
  DEVICE_WS_METHODS,
  EventId,
  ORCHESTRATION_WS_METHODS,
  type MessageId,
  type OrchestrationReadModel,
  type ProjectId,
  type ServerConfig,
  type ServerSettingsView,
  type ThreadId,
  TurnId,
  type WsWelcomePayload,
  WS_METHODS,
} from "@forkara/contracts";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { ws, http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { useComposerDraftStore } from "../composerDraftStore";
import { getRouter } from "../router";
import { useStore } from "../store";
import {
  createShellSnapshotFromReadModel,
  flattenEffectRpcRequestPayload,
  readEffectRpcClientMessage,
  sendEffectRpcChunk,
  sendEffectRpcExit,
  type EffectRpcWebSocketClient,
} from "../test/effectRpcWebSocketMock";
import { createBrowserTestServerConfig, createFullscreenTestHost } from "../test/browserHarness";
import { resetWsNativeApiForTest } from "../wsNativeApi";
import { readNativeApi } from "../nativeApi";
import { getAchievementSnapshot, resetAchievementState } from "../achievements/engine";
import { BULLY_MODE_CAPTURE_ACTIVITY_KIND } from "../achievements/bullyMode";

const THREAD_ID = "thread-kb-toast-test" as ThreadId;
const PROJECT_ID = "project-1" as ProjectId;
const NOW_ISO = "2026-03-04T12:00:00.000Z";

interface TestFixture {
  snapshot: OrchestrationReadModel;
  serverConfig: ServerConfig;
  serverSettings: ServerSettingsView;
  welcome: WsWelcomePayload;
}

let fixture: TestFixture;
let serverConfigStreamClient: EffectRpcWebSocketClient | null = null;
let serverConfigStreamRequestId: string | null = null;

const wsLink = ws.link(/ws(s)?:\/\/.*/);

function createBaseServerConfig(): ServerConfig {
  return createBrowserTestServerConfig(NOW_ISO);
}

function createMinimalSnapshot(): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    spaces: [],
    projects: [
      {
        id: PROJECT_ID,
        kind: "project",
        title: "Project",
        workspaceRoot: "/repo/project",
        defaultModelSelection: {
          provider: "codex",
          model: "gpt-5",
        },
        scripts: [],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
      },
    ],
    threads: [
      {
        id: THREAD_ID,
        projectId: PROJECT_ID,
        title: "Test thread",
        modelSelection: {
          provider: "codex",
          model: "gpt-5",
        },
        interactionMode: "default",
        runtimeMode: "full-access",
        envMode: "local",
        branch: "main",
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        handoff: null,
        messages: [
          {
            id: "msg-1" as MessageId,
            role: "user",
            text: "hello",
            turnId: null,
            streaming: false,
            source: "native",
            createdAt: NOW_ISO,
            updatedAt: NOW_ISO,
          },
        ],
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: NOW_ISO,
        },
      },
    ],
    updatedAt: NOW_ISO,
  };
}

function buildFixture(): TestFixture {
  return {
    snapshot: createMinimalSnapshot(),
    serverConfig: createBaseServerConfig(),
    serverSettings: DEFAULT_SERVER_SETTINGS_VIEW,
    welcome: {
      cwd: "/repo/project",
      projectName: "Project",
      bootstrapProjectId: PROJECT_ID,
      bootstrapThreadId: THREAD_ID,
    },
  };
}

function getThreadDetailFromFixtureSnapshot(
  threadId: ThreadId,
): OrchestrationReadModel["threads"][number] {
  const thread = fixture.snapshot.threads.find((entry) => entry.id === threadId);
  if (!thread) {
    throw new Error(`Missing thread fixture for ${threadId}`);
  }
  return thread;
}

function resolveWsRpc(tag: string): unknown {
  if (tag === ORCHESTRATION_WS_METHODS.getShellSnapshot) {
    return createShellSnapshotFromReadModel(fixture.snapshot);
  }
  if (tag === ORCHESTRATION_WS_METHODS.getSnapshot) {
    return fixture.snapshot;
  }
  if (tag === WS_METHODS.serverGetConfig) {
    return fixture.serverConfig;
  }
  if (tag === WS_METHODS.serverGetSettings) {
    return fixture.serverSettings;
  }
  if (tag === WS_METHODS.projectsListDevServers) {
    return { servers: [] };
  }
  if (tag === WS_METHODS.automationList) {
    return { definitions: [], runs: [] };
  }
  if (tag === WS_METHODS.gitListBranches) {
    return {
      isRepo: true,
      hasOriginRemote: true,
      branches: [{ name: "main", current: true, isDefault: true, worktreePath: null }],
    };
  }
  if (tag === WS_METHODS.gitStatus) {
    return {
      branch: "main",
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    };
  }
  if (tag === WS_METHODS.projectsSearchEntries) {
    return { entries: [], truncated: false };
  }
  return {};
}

const worker = setupWorker(
  wsLink.addEventListener("connection", ({ client }) => {
    client.addEventListener("message", (event) => {
      const rawData = event.data;
      if (typeof rawData !== "string") return;
      const parsed = readEffectRpcClientMessage(client, rawData);
      if (parsed.kind !== "request") return;

      const requestBody = flattenEffectRpcRequestPayload(
        parsed.request.tag,
        parsed.request.payload,
      );
      const method = requestBody._tag;
      if (method === WS_METHODS.subscribeServerLifecycle) {
        sendEffectRpcChunk(client, parsed.request.id, {
          type: "welcome",
          payload: fixture.welcome,
        });
        return;
      }
      if (method === WS_METHODS.subscribeServerConfig) {
        serverConfigStreamClient = client;
        serverConfigStreamRequestId = parsed.request.id;
        sendEffectRpcChunk(client, parsed.request.id, {
          type: "snapshot",
          config: fixture.serverConfig,
        });
        return;
      }
      if (method === ORCHESTRATION_WS_METHODS.subscribeShell) {
        sendEffectRpcChunk(client, parsed.request.id, {
          kind: "snapshot",
          snapshot: createShellSnapshotFromReadModel(fixture.snapshot),
        });
        return;
      }
      if (method === ORCHESTRATION_WS_METHODS.subscribeThread && "threadId" in requestBody) {
        const threadId = requestBody.threadId as ThreadId;
        sendEffectRpcChunk(client, parsed.request.id, {
          kind: "snapshot",
          snapshot: {
            snapshotSequence: fixture.snapshot.snapshotSequence,
            thread: getThreadDetailFromFixtureSnapshot(threadId),
          },
        });
        return;
      }
      if (
        method === WS_METHODS.subscribeServerProviderStatuses ||
        method === WS_METHODS.subscribeServerSettings ||
        method === WS_METHODS.subscribeTerminalEvents ||
        method === WS_METHODS.subscribeOrchestrationDomainEvents ||
        method === WS_METHODS.subscribeProjectDevServerEvents ||
        method === WS_METHODS.subscribeAutomationEvents ||
        // Left open like the rest: these are infinite subscriptions, and the
        // default below answers with an Exit, which a stream RPC reads as the
        // socket dying and answers with a full reconnect. That loops forever
        // and fills the run with schema errors about an Exit whose Success
        // value is `{}` where Void was expected.
        method === DEVICE_WS_METHODS.subscribeEvents
      ) {
        return;
      }
      sendEffectRpcExit(client, parsed.request.id, resolveWsRpc(method));
    });
  }),
  http.get("*/attachments/:attachmentId", () => new HttpResponse(null, { status: 204 })),
  http.get("*/api/project-favicon", () => new HttpResponse(null, { status: 204 })),
);

async function sendServerConfigUpdatedPush(
  issues: Array<{ kind: string; message: string }>,
): Promise<void> {
  await vi.waitFor(
    () => {
      expect(serverConfigStreamRequestId).toBeTruthy();
      expect(serverConfigStreamClient).toBeTruthy();
    },
    { timeout: 4_000, interval: 16 },
  );
  if (!serverConfigStreamRequestId || !serverConfigStreamClient) return;
  sendEffectRpcChunk(serverConfigStreamClient, serverConfigStreamRequestId, {
    type: "configUpdated",
    payload: {
      issues,
      providers: fixture.serverConfig.providers,
    },
  });
}

function queryToastTitles(): string[] {
  return Array.from(document.querySelectorAll('[data-slot="toast-title"]')).map(
    (el) => el.textContent ?? "",
  );
}

async function waitForToast(title: string, count = 1): Promise<void> {
  await vi.waitFor(
    () => {
      const matches = queryToastTitles().filter((t) => t === title);
      expect(matches.length, `Expected ${count} "${title}" toast(s)`).toBeGreaterThanOrEqual(count);
    },
    { timeout: 4_000, interval: 16 },
  );
}

async function waitForNoToast(title: string): Promise<void> {
  await vi.waitFor(
    () => {
      expect(queryToastTitles().filter((t) => t === title)).toHaveLength(0);
    },
    { timeout: 10_000, interval: 50 },
  );
}

async function mountApp(): Promise<{ cleanup: () => Promise<void> }> {
  const host = createFullscreenTestHost();

  const router = getRouter(createMemoryHistory({ initialEntries: [`/${THREAD_ID}`] }));

  const screen = await render(<RouterProvider router={router} />, {
    container: host,
  });
  try {
    await vi.waitFor(
      () => {
        expect(serverConfigStreamRequestId).toBeTruthy();
        expect(serverConfigStreamClient).toBeTruthy();
      },
      { timeout: 20_000, interval: 16 },
    );
  } catch (cause) {
    await screen.unmount();
    if (host.isConnected) host.remove();
    throw cause;
  }
  let cleanedUp = false;

  return {
    cleanup: async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      await screen.unmount();
      if (host.isConnected) host.remove();
    },
  };
}

function installPersonalitySendBoundary(input?: { rejectTurnStart?: boolean }): {
  readonly commands: unknown[];
  readonly restore: () => void;
} {
  const previousNativeApi = window.nativeApi;
  const api = readNativeApi();
  if (!api) throw new Error("Expected the browser native API fixture.");
  const commands: unknown[] = [];
  Object.defineProperty(window, "nativeApi", {
    configurable: true,
    value: {
      ...api,
      orchestration: {
        ...api.orchestration,
        dispatchCommand: async (
          command: Parameters<typeof api.orchestration.dispatchCommand>[0],
        ) => {
          commands.push(command);
          if (input?.rejectTurnStart && command.type === "thread.turn.start") {
            throw new Error("Recoverable provider fixture failure.");
          }
          return { sequence: fixture.snapshot.snapshotSequence + 1 };
        },
      },
    },
  });
  return {
    commands,
    restore: () => {
      if (previousNativeApi) {
        Object.defineProperty(window, "nativeApi", {
          configurable: true,
          value: previousNativeApi,
        });
      } else {
        Reflect.deleteProperty(window, "nativeApi");
      }
    },
  };
}

async function waitForPersonalityComposer(): Promise<{
  readonly editor: HTMLElement;
  readonly sendButton: HTMLButtonElement;
}> {
  let editor: HTMLElement | null = null;
  let sendButton: HTMLButtonElement | null = null;
  await vi.waitFor(
    () => {
      editor = document.querySelector<HTMLElement>('[contenteditable="true"]');
      sendButton = document.querySelector<HTMLButtonElement>('button[aria-label="Send message"]');
      expect(editor).not.toBeNull();
      expect(sendButton).not.toBeNull();
    },
    { timeout: 20_000, interval: 16 },
  );
  return { editor: editor!, sendButton: sendButton! };
}

describe("Keybindings update toast", () => {
  beforeAll(async () => {
    fixture = buildFixture();
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
  });

  afterAll(async () => {
    await resetWsNativeApiForTest();
    await worker.stop();
  });

  beforeEach(async () => {
    await resetWsNativeApiForTest();
    localStorage.clear();
    document.body.innerHTML = "";
    serverConfigStreamClient = null;
    serverConfigStreamRequestId = null;
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
    useStore.setState({
      projects: [],
      threadIds: [],
      threadShellById: {},
      threadSessionById: {},
      threadTurnStateById: {},
      messageIdsByThreadId: {},
      messageByThreadId: {},
      activityIdsByThreadId: {},
      activityByThreadId: {},
      proposedPlanIdsByThreadId: {},
      proposedPlanByThreadId: {},
      turnDiffIdsByThreadId: {},
      turnDiffSummaryByThreadId: {},
      sidebarThreadSummaryById: {},
      threadsHydrated: false,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("[personality-smoke] sends Bully Mode and per-turn precision through the full app", async () => {
    fixture = buildFixture();
    resetAchievementState();
    fixture.serverSettings = {
      ...fixture.serverSettings,
      bullyModeEnabled: true,
    };
    const completedTurnId = TurnId.makeUnsafe("turn-personality-bully-completed");
    fixture.snapshot = {
      ...fixture.snapshot,
      threads: fixture.snapshot.threads.map((thread) =>
        Object.assign({}, thread, {
          activities: [
            {
              id: EventId.makeUnsafe("activity-personality-bully-capture"),
              createdAt: NOW_ISO,
              kind: BULLY_MODE_CAPTURE_ACTIVITY_KIND,
              summary: "Bully Mode captured",
              tone: "info" as const,
              turnId: completedTurnId,
              payload: { bullyModeEnabled: true },
            },
            {
              id: EventId.makeUnsafe("activity-personality-bully-completed"),
              createdAt: NOW_ISO,
              kind: "turn.completed",
              summary: "Turn completed",
              tone: "info" as const,
              turnId: completedTurnId,
              payload: { state: "completed" },
            },
          ],
        }),
      ),
    };
    const boundary = installPersonalitySendBoundary();
    const app = await mountApp();

    try {
      await expect
        .element(page.getByRole("button", { name: "Disable Bully Mode" }))
        .toBeInTheDocument();
      await page.getByRole("button", { name: /Make No Mistake is off/u }).click();
      await page.getByRole("button", { name: /level 1 of 3/u }).click();
      await page.getByRole("button", { name: /level 2 of 3/u }).click();
      const { sendButton } = await waitForPersonalityComposer();
      useComposerDraftStore.getState().setPrompt(THREAD_ID, "Exercise personality composition");
      await vi.waitFor(() => expect(sendButton.disabled).toBe(false));
      sendButton.click();

      await vi.waitFor(() => {
        const turnStart = boundary.commands.find(
          (command) =>
            command !== null &&
            typeof command === "object" &&
            "type" in command &&
            command.type === "thread.turn.start",
        ) as { responseModifiers?: unknown } | undefined;
        expect(turnStart?.responseModifiers).toEqual({ makeNoMistakeLevel: 3 });
      });
      await expect
        .element(page.getByRole("button", { name: /Make No Mistake is off/u }))
        .toBeInTheDocument();
      expect(getAchievementSnapshot().some((unlock) => unlock.id === "dirt_in_your_eye")).toBe(
        true,
      );
    } finally {
      boundary.restore();
      resetAchievementState();
      await app.cleanup();
    }
  });

  it("[personality-smoke] keeps a recoverable No Forks Given failure inline", async () => {
    fixture = buildFixture();
    localStorage.setItem(
      "synara:app-settings:v1",
      JSON.stringify({ noForksGivenModeEnabled: true }),
    );
    const boundary = installPersonalitySendBoundary({ rejectTurnStart: true });
    const app = await mountApp();

    try {
      await page.getByRole("button", { name: /Make No Mistake is off/u }).click();
      const { sendButton } = await waitForPersonalityComposer();
      useComposerDraftStore.getState().setPrompt(THREAD_ID, "Trigger recoverable fixture failure");
      await vi.waitFor(() => expect(sendButton.disabled).toBe(false));
      sendButton.click();

      await vi.waitFor(() => {
        expect(document.body.textContent).toContain("Recoverable provider fixture failure.");
      });
      await expect.element(page.getByText("Make No Mistake · 1")).toBeVisible();
      await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    } finally {
      boundary.restore();
      await app.cleanup();
    }
  });

  it("does not show success toasts for passive keybinding reloads", async () => {
    const mounted = await mountApp();

    try {
      await sendServerConfigUpdatedPush([]);
      await waitForNoToast("Keybindings updated");

      await sendServerConfigUpdatedPush([]);
      await waitForNoToast("Keybindings updated");
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows a warning toast when keybinding config has issues", async () => {
    const mounted = await mountApp();

    try {
      await sendServerConfigUpdatedPush([
        {
          kind: "keybindings.malformed-config",
          message: "Expected JSON array",
        },
      ]);
      await waitForToast("Invalid keybindings configuration");
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not show a toast from the replayed cached value on subscribe", async () => {
    const mounted = await mountApp();

    try {
      await sendServerConfigUpdatedPush([]);
      await waitForNoToast("Keybindings updated");

      // Remount the app — onServerConfigUpdated replays the cached value
      // synchronously on subscribe. This should NOT produce a toast.
      await mounted.cleanup();
      const remounted = await mountApp();

      // Give it a moment to process the replayed value
      await new Promise((resolve) => setTimeout(resolve, 500));

      const titles = queryToastTitles();
      expect(
        titles.filter((t) => t === "Keybindings updated").length,
        "Replayed cached value should not produce a toast",
      ).toBe(0);

      await remounted.cleanup();
    } catch (error) {
      await mounted.cleanup().catch(() => {});
      throw error;
    }
  });
});
