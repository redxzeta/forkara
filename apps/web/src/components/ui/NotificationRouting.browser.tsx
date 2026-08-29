// FILE: NotificationRouting.browser.tsx
// Purpose: Browser coverage for focus history and default dialog stacking.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { createNotificationRouter, type PortalNotificationManager } from "../../notificationRouter";
import { createStatusHistoryManager } from "../../statusHistory";
import { StatusHistoryDock, StatusHistoryProvider } from "../focus/StatusHistory";
import { Button } from "./button";
import { Dialog, DialogPopup, DialogTitle } from "./dialog";
import { setNotificationFocusMode, ToastProvider, toastManager } from "./toast";

function portalStub(): PortalNotificationManager {
  return {
    add: vi.fn(() => "portal-id"),
    update: vi.fn(),
    close: vi.fn(),
    promise: vi.fn(async (promise) => promise),
  };
}

describe("notification routing surfaces", () => {
  afterEach(() => {
    setNotificationFocusMode(false);
    toastManager.close();
    document.body.innerHTML = "";
  });

  it("renders repeated errors and preserved undo actions in history without toast portals", async () => {
    const history = createStatusHistoryManager();
    const router = createNotificationRouter({ portal: portalStub(), history });
    const undo = vi.fn();
    router.setFocusMode(true);
    router.add({
      type: "error",
      title: "Task failed",
      data: { taskId: "task-9", archiveUndo: { onUndo: undo, onViewArchived: vi.fn() } },
    });
    router.add({ type: "error", title: "Task failed", data: { taskId: "task-9" } });

    await render(
      <StatusHistoryProvider manager={history}>
        <StatusHistoryDock />
      </StatusHistoryProvider>,
    );
    await userEvent.click(page.getByRole("button", { name: /Task failed.*1 entry/ }));
    await expect.element(page.getByLabelText("2 occurrences")).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-slot="toast-portal"]')).toBeNull();
  });

  it("keeps default-mode toasts below an active dialog", async () => {
    setNotificationFocusMode(false);
    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => (
        <ToastProvider>
          <Dialog open>
            <DialogPopup>
              <DialogTitle>Blocking dialog</DialogTitle>
              <Button>Dialog control</Button>
            </DialogPopup>
          </Dialog>
        </ToastProvider>
      ),
    });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree: rootRoute.addChildren([indexRoute]),
    });
    await render(<RouterProvider router={router} />);
    toastManager.add({ type: "warning", title: "Provider update available", timeout: 0 });

    const viewport = document.querySelector<HTMLElement>('[data-slot="toast-viewport"]');
    const dialogViewport = document.querySelector<HTMLElement>('[data-slot="dialog-viewport"]');
    expect(viewport).not.toBeNull();
    expect(dialogViewport).not.toBeNull();
    expect(Number(getComputedStyle(viewport!).zIndex)).toBeLessThan(
      Number(getComputedStyle(dialogViewport!).zIndex),
    );
    await userEvent.click(page.getByRole("button", { name: "Dialog control" }));
    expect(document.activeElement).toBe(
      page.getByRole("button", { name: "Dialog control" }).element(),
    );
  });
});
