// FILE: statusHistory.test.ts
// Purpose: Verifies bounded, session-only status history and stable-key coalescing.

import { describe, expect, it, vi } from "vitest";

import { createStatusHistoryManager } from "./statusHistory";

describe("createStatusHistoryManager", () => {
  it("coalesces matching stable keys while preserving omitted actions and details", () => {
    let timestamp = 1;
    const retry = vi.fn();
    const manager = createStatusHistoryManager({ now: () => timestamp++ });
    const id = manager.add({
      stableKey: "clone:failed",
      tone: "error",
      title: "Clone failed",
      summary: "First delivery",
      correctiveAction: "Check access and retry.",
      technicalDetails: "redacted transport output",
      copyText: "safe diagnostic",
      actions: [{ id: "retry", label: "Retry", kind: "retry", onAction: retry }],
    });

    expect(
      manager.add({
        stableKey: "clone:failed",
        tone: "error",
        title: "Clone still failing",
        summary: "Second delivery",
      }),
    ).toBe(id);

    expect(manager.getSnapshot()).toEqual([
      expect.objectContaining({
        id,
        title: "Clone still failing",
        summary: "Second delivery",
        occurrenceCount: 2,
        correctiveAction: "Check access and retry.",
        technicalDetails: "redacted transport output",
        copyText: "safe diagnostic",
        actions: [expect.objectContaining({ id: "retry", onAction: retry })],
        createdAt: 1,
        updatedAt: 2,
      }),
    ]);
  });

  it("coalesces by operation id even when the stable key changes", () => {
    const manager = createStatusHistoryManager();
    const id = manager.add({
      operationId: "operation-7",
      stableKey: "clone:started",
      tone: "loading",
      title: "Cloning",
    });

    expect(
      manager.add({
        operationId: "operation-7",
        stableKey: "clone:complete",
        tone: "success",
        title: "Clone complete",
      }),
    ).toBe(id);
    expect(manager.getSnapshot()).toEqual([
      expect.objectContaining({
        id,
        stableKey: "clone:complete",
        tone: "success",
        occurrenceCount: 2,
      }),
    ]);
  });

  it("keeps only the newest one hundred entries by default", () => {
    const manager = createStatusHistoryManager();
    for (let index = 0; index < 105; index += 1) {
      manager.add({ tone: "info", title: `Entry ${index}` });
    }

    expect(manager.getSnapshot()).toHaveLength(100);
    expect(manager.getSnapshot()[0]?.title).toBe("Entry 104");
    expect(manager.getSnapshot().at(-1)?.title).toBe("Entry 5");
  });

  it("notifies subscribers for additions, dismissals, and clear", () => {
    const manager = createStatusHistoryManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    const id = manager.add({ tone: "info", title: "One" });
    manager.dismiss(id);
    manager.add({ tone: "success", title: "Two" });
    manager.clear();
    unsubscribe();
    manager.add({ tone: "info", title: "Ignored by subscriber" });

    expect(listener).toHaveBeenCalledTimes(4);
  });
});
