import { describe, expect, it, vi } from "vitest";

import {
  createNotificationRouter,
  deriveNotificationStableKey,
  type PortalNotificationManager,
} from "./notificationRouter";
import { createStatusHistoryManager } from "./statusHistory";

function createPortalHarness() {
  let nextId = 1;
  const portal: PortalNotificationManager = {
    add: vi.fn(() => `portal-${nextId++}`),
    update: vi.fn(),
    close: vi.fn(),
    promise: vi.fn(async (promise) => promise),
  };
  return portal;
}

describe("notification router", () => {
  it("preserves the portal manager in default mode", () => {
    const portal = createPortalHarness();
    const history = createStatusHistoryManager();
    const router = createNotificationRouter({ portal, history });

    const id = router.add({ type: "success", title: "Done" });
    router.update(id, { title: "Really done" });
    router.close(id);

    expect(id).toBe("portal-1");
    expect(portal.add).toHaveBeenCalledOnce();
    expect(portal.update).toHaveBeenCalledOnce();
    expect(portal.close).toHaveBeenCalledWith(id);
    expect(history.getSnapshot()).toHaveLength(0);
  });

  it("routes actions, copy text, updates, and dismissal into bounded history", () => {
    const portal = createPortalHarness();
    const history = createStatusHistoryManager({ limit: 2 });
    const router = createNotificationRouter({ portal, history });
    const action = vi.fn();
    const secondary = vi.fn();
    const onClose = vi.fn();
    router.setFocusMode(true);

    const id = router.add({
      type: "loading",
      title: "Creating branch",
      description: "feature/router",
      actionProps: { children: "Retry", onClick: action },
      data: {
        branch: "feature/router",
        copyText: "git switch feature/router",
        onClose,
        secondaryActionProps: { children: "Details", onClick: secondary },
      },
    });
    router.update(id, { type: "success", title: "Branch created" });

    const entry = history.getSnapshot()[0]!;
    expect(entry).toMatchObject({
      tone: "success",
      title: "Branch created",
      copyText: "git switch feature/router",
      occurrenceCount: 1,
    });
    expect(entry.actions?.map((item) => item.label)).toEqual(["Retry", "Details"]);
    router.close(id);
    expect(onClose).toHaveBeenCalledOnce();
    expect(history.getSnapshot()).toHaveLength(0);
    expect(portal.add).not.toHaveBeenCalled();
  });

  it("deduplicates repeated errors and keeps promise progress on one entry", async () => {
    const portal = createPortalHarness();
    const history = createStatusHistoryManager();
    const router = createNotificationRouter({ portal, history });
    router.setFocusMode(true);

    router.add({ type: "error", title: "Task failed", data: { taskId: "task-1" } });
    router.add({ type: "error", title: "Task failed", data: { taskId: "task-1" } });
    expect(history.getSnapshot()[0]?.occurrenceCount).toBe(2);

    await router.promise(Promise.resolve("ok"), {
      loading: { title: "Running task", data: { stableKey: "task:2" } },
      success: (value) => ({ title: `Task ${value}`, data: { stableKey: "task:2" } }),
      error: "Task failed",
    });
    expect(history.getSnapshot().find((entry) => entry.stableKey === "task:2")).toMatchObject({
      title: "Task ok",
      tone: "success",
      occurrenceCount: 1,
    });
  });

  it("derives stable keys from event type and affected entities", () => {
    expect(
      deriveNotificationStableKey({
        type: "warning",
        title: "Provider update available",
        data: { providerVersionState: "codex:1.2->1.3", repository: "redxzeta/forkara" },
      }),
    ).toContain("codex:1.2->1.3:redxzeta/forkara");
  });
});
