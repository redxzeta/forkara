import "../index.css";

import {
  GitHubProjectProvisionError,
  SpaceId,
  type GitHubProjectProvisionProgressEvent,
} from "@forkara/contracts";
import { page } from "vitest/browser";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const nativeApi = vi.hoisted(() => ({
  dispatchCommand: vi.fn(async (_command: { readonly spaceId: string }) => ({ sequence: 1 })),
  onProvisionProgress: vi.fn(
    (_listener: (event: GitHubProjectProvisionProgressEvent) => void) => () => undefined,
  ),
}));

vi.mock("../nativeApi", () => ({
  readNativeApi: () => ({
    orchestration: { dispatchCommand: nativeApi.dispatchCommand },
    projects: { onProvisionProgress: nativeApi.onProvisionProgress },
  }),
}));

import { CreateProjectDock } from "./CreateProjectDock";
import type { CreateProjectSubmitOptions, CreateProjectSubmitValue } from "./CreateProjectForm";
import { SidebarShellLayout } from "./SidebarShellLayout";

const workSpaceId = SpaceId.makeUnsafe("space-work");
const workSpace = {
  id: workSpaceId,
  name: "Work",
  icon: "code-brackets" as const,
  sortOrder: 0,
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
};

describe("CreateProjectDock", () => {
  afterEach(() => {
    nativeApi.dispatchCommand.mockClear();
    nativeApi.onProvisionProgress.mockClear();
  });

  it("renders as an in-layout 420px dock without a modal, backdrop, focus trap, or toast", async () => {
    await render(
      <CreateProjectDock
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const dock = page.getByRole("complementary", { name: "Create project" }).element();
    expect(dock.className).toContain("w-full");
    expect(dock.className).toContain("md:w-[420px]");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[data-slot="dialog-backdrop"]')).toBeNull();
    expect(document.querySelector('[data-slot="toast"]')).toBeNull();
  });

  it("submits a local project, reports success, and closes without a toast", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    await render(
      <CreateProjectDock
        open
        githubProvisioningAvailable
        spaces={[workSpace]}
        activeSpaceId={workSpaceId}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        onSuccess={onSuccess}
      />,
    );

    await page.getByLabelText("Project folder path").fill("/tmp/local-project");
    await page.getByRole("button", { name: "Create project", exact: true }).click();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      source: "local",
      workspaceRoot: "/tmp/local-project",
      spaceId: workSpaceId,
      createIfMissing: true,
    });
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.querySelector('[data-slot="toast"]')).toBeNull();
  });

  it("submits GitHub provisioning and preserves the selected operation and Space", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await render(
      <CreateProjectDock
        open
        githubProvisioningAvailable
        spaces={[workSpace]}
        activeSpaceId={workSpaceId}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("radio", { name: "GitHub" }).click();
    await page.getByRole("radio", { name: /Fork and clone/ }).click();
    await page.getByLabelText(/Fork destination/).fill("example-org");
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByLabelText("Clone into").fill("/tmp/projects");
    await page.getByLabelText("Folder name").fill("codex-work");
    await page.getByRole("button", { name: "Fork and add" }).click();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      source: "github",
      operation: "fork-and-clone",
      forkDestinationOwner: "example-org",
      repository: "openai/codex",
      destinationParent: "/tmp/projects",
      directoryName: "codex-work",
      spaceId: workSpaceId,
    });
  });

  it("preserves all GitHub fields and coalesces an identical typed failure across retry", async () => {
    const failure = new GitHubProjectProvisionError({
      operationId: "stable-server-operation",
      stage: "clone",
      code: "CLONE_TRANSPORT_FAILED",
      summary: "Forkara could not reach GitHub while cloning.",
      correctiveAction: "Check the server network connection and retry.",
      technicalDetails: "connection reset by peer",
      retryable: true,
    });
    const onSubmit = vi.fn().mockRejectedValue(failure);
    await render(
      <CreateProjectDock
        open
        githubProvisioningAvailable
        spaces={[workSpace]}
        activeSpaceId={workSpaceId}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("radio", { name: "GitHub" }).click();
    await page.getByRole("radio", { name: /Fork and clone/ }).click();
    await page.getByLabelText(/Fork destination/).fill("example-org");
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByLabelText("Clone into").fill("/tmp/projects");
    await page.getByLabelText("Folder name").fill("codex-work");
    await page.getByRole("button", { name: "Fork and add" }).click();

    const alert = page.getByRole("alert", { name: "Operation failed" });
    await expect.element(alert).toBeVisible();
    await page.getByRole("button", { name: "Technical details" }).click();
    expect(alert.element().textContent).toContain("connection reset by peer");
    const firstOperationId = onSubmit.mock.calls[0]?.[0].operationId;

    await page.getByRole("button", { name: "Retry" }).click();
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    await expect.element(page.getByLabelText("2 occurrences")).toBeVisible();
    const retryValue = onSubmit.mock.calls[1]?.[0];
    expect(retryValue).toMatchObject({
      operation: "fork-and-clone",
      forkDestinationOwner: "example-org",
      repository: "openai/codex",
      destinationParent: "/tmp/projects",
      directoryName: "codex-work",
      spaceId: workSpaceId,
    });
    expect(retryValue.operationId).not.toBe(firstOperationId);
    await page.getByRole("button", { name: "Dismiss" }).click();
    expect(page.getByRole("alert", { name: "Operation failed" }).query()).toBeNull();
  });

  it("allows correcting a failed submission before retrying with a fresh operation id", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(
        new GitHubProjectProvisionError({
          operationId: "first-server-operation",
          stage: "destination",
          code: "DESTINATION_CONFLICT",
          summary: "The destination folder is not empty.",
          correctiveAction: "Choose a different folder name and retry.",
          technicalDetails: null,
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(undefined);
    await render(
      <CreateProjectDock
        open
        githubProvisioningAvailable
        spaces={[workSpace]}
        activeSpaceId={workSpaceId}
        defaultCloneParent="/tmp/projects"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("radio", { name: "GitHub" }).click();
    await page.getByRole("radio", { name: /Fork and clone/ }).click();
    await page.getByLabelText(/Fork destination/).fill("example-org");
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByLabelText("Folder name").fill("codex-work");
    await page.getByRole("button", { name: "Fork and add" }).click();
    await expect
      .element(page.getByRole("alert", { name: "Operation failed" }))
      .toHaveTextContent("Choose a different folder name");
    const firstValue = onSubmit.mock.calls[0]?.[0];

    await page.getByLabelText("Folder name").fill("codex-retry");
    expect(page.getByRole("alert", { name: "Operation failed" }).query()).toBeNull();
    await page.getByRole("button", { name: "Fork and add" }).click();
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    const retryValue = onSubmit.mock.calls[1]?.[0];
    expect(retryValue).toMatchObject({
      operation: "fork-and-clone",
      forkDestinationOwner: "example-org",
      repository: "openai/codex",
      destinationParent: "/tmp/projects",
      directoryName: "codex-retry",
      spaceId: workSpaceId,
    });
    expect(retryValue.operationId).not.toBe(firstValue.operationId);
  });

  it("invalidates cancellation so late progress and success cannot close or report success again", async () => {
    let resolveSubmission: (() => void) | undefined;
    let progressListener: ((event: GitHubProjectProvisionProgressEvent) => void) | undefined;
    nativeApi.onProvisionProgress.mockImplementation((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    const onSubmit = vi.fn(
      (_value: CreateProjectSubmitValue, _options: CreateProjectSubmitOptions) =>
        new Promise<void>((resolve) => {
          resolveSubmission = resolve;
        }),
    );
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <CreateProjectDock
          open={open}
          githubProvisioningAvailable
          spaces={[]}
          activeSpaceId={null}
          defaultCloneParent="/tmp"
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen);
            setOpen(nextOpen);
          }}
          onSubmit={onSubmit}
          onSuccess={onSuccess}
        />
      );
    }

    await render(<Harness />);
    await page.getByRole("radio", { name: "GitHub" }).click();
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByRole("button", { name: "Clone and add" }).click();
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const submittedValue = onSubmit.mock.calls[0]![0];
    const signal = onSubmit.mock.calls[0]![1].signal;
    await page.getByRole("button", { name: "Cancel clone" }).click();
    expect(signal.aborted).toBe(true);
    expect(submittedValue.source).toBe("github");
    if (submittedValue.source !== "github") throw new Error("Expected GitHub submission.");

    progressListener?.({
      operationId: submittedValue.operationId,
      kind: "phase",
      phase: "cloning",
      message: "Late progress",
    });
    resolveSubmission?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("creates a Space inline and selects it without opening a dialog", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await render(
      <CreateProjectDock
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/tmp"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("button", { name: "New space" }).click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await page.getByLabelText("Name").fill("Client work");
    await page.getByRole("button", { name: "Create space" }).click();
    await vi.waitFor(() => expect(nativeApi.dispatchCommand).toHaveBeenCalledOnce());
    const createdSpaceId = nativeApi.dispatchCommand.mock.calls[0]![0].spaceId;

    await page.getByLabelText("Project folder path").fill("/tmp/client-work");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].spaceId).toBe(createdSpaceId);
  });

  it("keeps the dock between the sidebar and hidden narrow main content", async () => {
    await render(
      <SidebarShellLayout
        sidebar={<div data-testid="sidebar" />}
        projectCreationSurface={<div data-testid="dock" />}
        mainContent={<div data-testid="route" />}
        hideMainContentOnNarrowScreens
      />,
    );

    const sidebar = page.getByTestId("sidebar").element();
    const dock = page.getByTestId("dock").element();
    const main = document.querySelector<HTMLElement>('[data-slot="chat-main-content"]');
    expect(sidebar.nextElementSibling).toBe(dock);
    expect(dock.nextElementSibling).toBe(main);
    expect(main?.className).toContain("max-md:hidden");
  });
});
