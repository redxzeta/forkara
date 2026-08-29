import { afterEach, describe, expect, it, vi } from "vitest";

import { confirmationQueueManager } from "../confirmationQueue";
import { setFocusModeRuntimeEnabled } from "../focusModeRuntime";
import { confirmCoreAction } from "./confirmCoreAction";

const confirmation = {
  stableKey: "thread-delete:one",
  title: "Delete thread?",
  description: "This cannot be undone.",
  confirmLabel: "Delete",
  destructive: true,
} as const;

describe("confirmCoreAction", () => {
  afterEach(() => {
    confirmationQueueManager.cancelAll();
    setFocusModeRuntimeEnabled(false);
  });

  it("preserves the default native confirmation path", async () => {
    const defaultConfirm = vi.fn(async () => true);
    await expect(confirmCoreAction({ confirmation, defaultConfirm })).resolves.toBe(true);
    expect(defaultConfirm).toHaveBeenCalledOnce();
  });

  it("only approves the owning focus-mode request", async () => {
    setFocusModeRuntimeEnabled(true);
    const defaultConfirm = vi.fn(async () => true);
    const owner = confirmCoreAction({ confirmation, defaultConfirm });
    const duplicate = confirmCoreAction({ confirmation, defaultConfirm });

    await expect(duplicate).resolves.toBe(false);
    confirmationQueueManager.confirm(confirmationQueueManager.getSnapshot().current!.id);
    await expect(owner).resolves.toBe(true);
    expect(defaultConfirm).not.toHaveBeenCalled();
  });
});
