// FILE: ConfirmationQueue.browser.tsx
// Purpose: Browser coverage for portal-free destructive gating and keyboard operation.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { createConfirmationQueueManager } from "../../confirmationQueue";
import { ConfirmationQueueProvider, ConfirmationQueueRegion } from "./ConfirmationQueue";

const request = (stableKey: string, title: string) => ({
  stableKey,
  title,
  description: `${title} cannot be undone.`,
  confirmLabel: "Confirm",
  destructive: true,
});

describe("ConfirmationQueueRegion", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("coalesces duplicate destructive requests and only lets the owner execute", async () => {
    const manager = createConfirmationQueueManager();
    const protectedAction = vi.fn();
    await render(
      <ConfirmationQueueProvider manager={manager}>
        <main>
          <button
            type="button"
            onClick={() => {
              void manager.request(request("thread-delete:1", "Delete thread?")).then((result) => {
                if (result === "confirmed") protectedAction();
              });
            }}
          >
            Request delete
          </button>
          <ConfirmationQueueRegion />
        </main>
      </ConfirmationQueueProvider>,
    );

    await userEvent.click(page.getByRole("button", { name: "Request delete" }));
    await userEvent.click(page.getByRole("button", { name: "Request delete" }));
    await expect.element(page.getByLabelText("2 occurrences")).toBeVisible();
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
    expect(document.querySelector('[data-slot="toast-popup"]')).toBeNull();

    await userEvent.click(page.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(protectedAction).toHaveBeenCalledOnce());
    expect(manager.getSnapshot().current).toBeNull();
  });

  it("uses FIFO order and supports Tab, Enter, Space, and Escape without stealing focus", async () => {
    const manager = createConfirmationQueueManager();
    const first = manager.request(request("first", "First action?"));
    const second = manager.request(request("second", "Second action?"));
    await render(
      <ConfirmationQueueProvider manager={manager}>
        <button type="button">Before queue</button>
        <ConfirmationQueueRegion />
      </ConfirmationQueueProvider>,
    );

    const before = page.getByRole("button", { name: "Before queue" });
    before.element().focus();
    expect(document.activeElement).toBe(before.element());
    await userEvent.tab();
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Confirm" }).element());
    await userEvent.keyboard("{Enter}");
    await expect(first).resolves.toBe("confirmed");
    await expect.element(page.getByRole("heading", { name: "Second action?" })).toBeVisible();

    page.getByRole("button", { name: "Confirm" }).element().focus();
    await userEvent.keyboard("{Escape}");
    await expect(second).resolves.toBe("cancelled");
  });

  it("cancels unresolved work when its provider unmounts", async () => {
    const manager = createConfirmationQueueManager();
    const pending = manager.request(request("unmount", "Still pending?"));
    const rendered = await render(
      <ConfirmationQueueProvider manager={manager}>
        <ConfirmationQueueRegion />
      </ConfirmationQueueProvider>,
    );

    rendered.unmount();
    await expect(pending).resolves.toBe("cancelled");
  });
});
