// FILE: StatusHistory.browser.tsx
// Purpose: Browser coverage for portal-free status history, actions, and disclosure.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { createStatusHistoryManager } from "../../statusHistory";
import { StatusHistoryDock, StatusHistoryProvider } from "./StatusHistory";

describe("StatusHistoryDock", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders coalesced details and preserved action types without a portal", async () => {
    const retry = vi.fn();
    const undo = vi.fn();
    const manager = createStatusHistoryManager();
    manager.add({
      stableKey: "task:one",
      tone: "error",
      title: "Task failed",
      summary: "The task needs attention.",
      correctiveAction: "Correct the command and retry.",
      technicalDetails: "bounded safe details",
      copyText: "diagnostic-17",
      actions: [
        { id: "retry", label: "Retry", kind: "retry", onAction: retry },
        { id: "undo", label: "Undo", kind: "undo", onAction: undo },
      ],
    });
    manager.add({
      stableKey: "task:one",
      tone: "error",
      title: "Task failed again",
      summary: "Repeated delivery.",
    });

    await render(
      <main data-testid="layout-root">
        <StatusHistoryProvider manager={manager}>
          <StatusHistoryDock />
        </StatusHistoryProvider>
      </main>,
    );

    const dock = page.getByRole("complementary", { name: "Status history" });
    expect(page.getByTestId("layout-root").element().contains(dock.element())).toBe(true);
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();

    const historyToggle = page.getByRole("button", { name: /Task failed again.*1 entry/ });
    await userEvent.click(historyToggle);
    await expect.element(page.getByLabelText("2 occurrences")).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Details" }));
    expect(dock.element().textContent).toContain("Correct the command and retry.");
    expect(dock.element().textContent).toContain("bounded safe details");

    await userEvent.click(page.getByRole("button", { name: "Retry" }));
    await userEvent.click(page.getByRole("button", { name: "Undo" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(undo).toHaveBeenCalledOnce();
    await expect.element(page.getByRole("button", { name: "Copy" })).toBeVisible();
  });

  it("dismisses individual entries and clears the bounded session history", async () => {
    const manager = createStatusHistoryManager();
    manager.add({ tone: "info", title: "First" });
    manager.add({ tone: "success", title: "Second" });
    await render(
      <StatusHistoryProvider manager={manager}>
        <StatusHistoryDock />
      </StatusHistoryProvider>,
    );

    await userEvent.click(page.getByRole("button", { name: /Second.*2 entries/ }));
    await userEvent.click(page.getByRole("button", { name: "Dismiss First" }));
    expect(manager.getSnapshot().map((entry) => entry.title)).toEqual(["Second"]);
    await userEvent.click(page.getByRole("button", { name: "Clear history" }));
    expect(manager.getSnapshot()).toEqual([]);
    expect(document.querySelector('[data-slot="status-history-dock"]')).toBeNull();
  });
});
