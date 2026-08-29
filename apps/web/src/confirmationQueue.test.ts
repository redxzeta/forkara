import { describe, expect, it, vi } from "vitest";

import { createConfirmationQueueManager } from "./confirmationQueue";

const request = (stableKey: string, title = stableKey) => ({
  stableKey,
  title,
  description: `${title} description`,
  confirmLabel: "Confirm",
});

describe("confirmation queue", () => {
  it("shows one owning request at a time in FIFO order", async () => {
    const manager = createConfirmationQueueManager();
    const first = manager.request(request("first"));
    const second = manager.request(request("second"));

    expect(manager.getSnapshot()).toMatchObject({
      current: { stableKey: "first" },
      pendingCount: 1,
    });
    manager.confirm(manager.getSnapshot().current!.id);
    await expect(first).resolves.toBe("confirmed");
    expect(manager.getSnapshot().current?.stableKey).toBe("second");
    manager.cancel(manager.getSnapshot().current!.id);
    await expect(second).resolves.toBe("cancelled");
  });

  it("coalesces duplicate stable keys without transferring ownership", async () => {
    const manager = createConfirmationQueueManager();
    const owner = manager.request(request("delete:thread-1", "Delete thread?"));
    const duplicate = manager.request(request("delete:thread-1", "Delete thread now?"));

    await expect(duplicate).resolves.toBe("coalesced");
    expect(manager.getSnapshot().current).toMatchObject({ occurrenceCount: 2 });
    manager.confirm(manager.getSnapshot().current!.id);
    await expect(owner).resolves.toBe("confirmed");
  });

  it("cancels every unresolved owner when its provider unmounts", async () => {
    const manager = createConfirmationQueueManager();
    const listener = vi.fn();
    manager.subscribe(listener);
    const first = manager.request(request("first"));
    const second = manager.request(request("second"));

    manager.cancelAll();

    await expect(first).resolves.toBe("cancelled");
    await expect(second).resolves.toBe("cancelled");
    expect(manager.getSnapshot().current).toBeNull();
    expect(listener).toHaveBeenCalled();
  });
});
