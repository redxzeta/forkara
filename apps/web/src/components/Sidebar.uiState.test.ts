import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearLastThreadRouteIfMatches,
  normalizeSidebarProjectThreadListCwd,
  persistSidebarUiState,
  readSidebarUiState,
  subscribeSidebarUiState,
} from "./Sidebar.uiState";

describe("Sidebar.uiState", () => {
  let storage = new Map<string, string>();

  beforeEach(() => {
    storage = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: () => {},
        removeEventListener: () => {},
        localStorage: {
          clear: () => {
            storage.clear();
          },
          getItem: (key: string) => storage.get(key) ?? null,
          removeItem: (key: string) => {
            storage.delete(key);
          },
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("defaults collapsed sidebar UI state with no thread list paging", () => {
    expect(readSidebarUiState()).toEqual({
      chatSectionExpanded: false,
      chatThreadListExtraPages: 0,
      projectThreadListExtraPagesByCwd: {},
      dismissedThreadStatusKeyByThreadId: {},
      lastThreadRoute: null,
      activityViewEnabled: false,
    });
  });

  it("persists project thread list paging by normalized cwd", () => {
    persistSidebarUiState({
      chatSectionExpanded: true,
      chatThreadListExtraPages: 2,
      projectThreadListExtraPagesByCwd: {
        "/Users/tester/Code/demo": 1,
        "/Users/tester/Code/demo/": 3,
        "/Users/tester/Code/other": 2,
      },
      dismissedThreadStatusKeyByThreadId: {
        "thread-123": "Plan Ready:turn-1",
      },
      lastThreadRoute: {
        threadId: "thread-123",
        splitViewId: "split-456",
      },
      activityViewEnabled: true,
    });

    expect(readSidebarUiState()).toEqual({
      chatSectionExpanded: true,
      chatThreadListExtraPages: 2,
      projectThreadListExtraPagesByCwd: {
        // Duplicate cwds that normalize to the same key keep the deepest paging.
        [normalizeSidebarProjectThreadListCwd("/Users/tester/Code/demo")]: 3,
        [normalizeSidebarProjectThreadListCwd("/Users/tester/Code/other")]: 2,
      },
      dismissedThreadStatusKeyByThreadId: {
        "thread-123": "Plan Ready:turn-1",
      },
      lastThreadRoute: {
        threadId: "thread-123",
        splitViewId: "split-456",
      },
      activityViewEnabled: true,
    });
  });

  it("ignores malformed persisted thread list paging entries", () => {
    window.localStorage.setItem(
      "forkara:sidebar-ui:v1",
      JSON.stringify({
        chatSectionExpanded: true,
        chatThreadListExtraPages: -4,
        projectThreadListExtraPagesByCwd: {
          "/Users/tester/Code/demo": 2,
          "/Users/tester/Code/zero": 0,
          "/Users/tester/Code/negative": -1,
          "/Users/tester/Code/bad": "nope",
          "": 3,
        },
        dismissedThreadStatusKeyByThreadId: {
          "thread-123": "Awaiting Input:turn-2",
          "": "bad",
          "thread-456": 42,
        },
        lastThreadRoute: {
          threadId: "thread-123",
          splitViewId: 42,
        },
      }),
    );

    expect(readSidebarUiState()).toEqual({
      chatSectionExpanded: true,
      chatThreadListExtraPages: 0,
      projectThreadListExtraPagesByCwd: {
        [normalizeSidebarProjectThreadListCwd("/Users/tester/Code/demo")]: 2,
      },
      dismissedThreadStatusKeyByThreadId: {
        "thread-123": "Awaiting Input:turn-2",
      },
      lastThreadRoute: {
        threadId: "thread-123",
      },
      activityViewEnabled: false,
    });
  });

  it("migrates legacy all-or-nothing show-more state to one extra page", () => {
    window.localStorage.setItem(
      "forkara:sidebar-ui:v1",
      JSON.stringify({
        chatSectionExpanded: false,
        chatThreadListExpanded: true,
        expandedProjectThreadListCwds: ["/Users/tester/Code/demo", "/Users/tester/Code/other"],
      }),
    );

    expect(readSidebarUiState()).toMatchObject({
      chatThreadListExtraPages: 1,
      projectThreadListExtraPagesByCwd: {
        [normalizeSidebarProjectThreadListCwd("/Users/tester/Code/demo")]: 1,
        [normalizeSidebarProjectThreadListCwd("/Users/tester/Code/other")]: 1,
      },
    });
  });

  it("drops malformed persisted last thread routes", () => {
    window.localStorage.setItem(
      "forkara:sidebar-ui:v1",
      JSON.stringify({
        lastThreadRoute: {
          threadId: 42,
          splitViewId: "split-123",
        },
      }),
    );

    expect(readSidebarUiState()).toEqual({
      chatSectionExpanded: false,
      chatThreadListExtraPages: 0,
      projectThreadListExtraPagesByCwd: {},
      dismissedThreadStatusKeyByThreadId: {},
      lastThreadRoute: null,
      activityViewEnabled: false,
    });
  });

  it("atomically clears only a matching remembered route and preserves unrelated state", () => {
    persistSidebarUiState({
      chatSectionExpanded: true,
      chatThreadListExtraPages: 3,
      projectThreadListExtraPagesByCwd: { "/repo": 2 },
      dismissedThreadStatusKeyByThreadId: { "thread-other": "ready:turn-1" },
      lastThreadRoute: { threadId: "thread-stale", splitViewId: "split-stale" },
      activityViewEnabled: true,
    });

    expect(clearLastThreadRouteIfMatches("thread-other")).toBe(false);
    expect(readSidebarUiState().lastThreadRoute?.threadId).toBe("thread-stale");
    expect(clearLastThreadRouteIfMatches("thread-stale")).toBe(true);
    expect(readSidebarUiState()).toEqual({
      chatSectionExpanded: true,
      chatThreadListExtraPages: 3,
      projectThreadListExtraPagesByCwd: {
        [normalizeSidebarProjectThreadListCwd("/repo")]: 2,
      },
      dismissedThreadStatusKeyByThreadId: { "thread-other": "ready:turn-1" },
      lastThreadRoute: null,
      activityViewEnabled: true,
    });
  });

  it("notifies same-window sidebar consumers after a matching clear", () => {
    persistSidebarUiState({
      chatSectionExpanded: false,
      chatThreadListExtraPages: 0,
      projectThreadListExtraPagesByCwd: {},
      dismissedThreadStatusKeyByThreadId: {},
      lastThreadRoute: { threadId: "thread-stale" },
      activityViewEnabled: false,
    });
    const observed: Array<ReturnType<typeof readSidebarUiState>> = [];
    const unsubscribe = subscribeSidebarUiState((state) => observed.push(state));

    expect(clearLastThreadRouteIfMatches("thread-stale")).toBe(true);
    expect(observed).toHaveLength(1);
    expect(observed[0]?.lastThreadRoute).toBeNull();

    unsubscribe();
  });
});
