import "../index.css";

import { GitHubProjectProvisionError } from "@forkara/contracts";
import { page } from "vitest/browser";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const nativeApi = vi.hoisted(() => ({
  onProvisionProgress: vi.fn(() => () => undefined),
}));

vi.mock("../nativeApi", () => ({
  readNativeApi: () => ({
    projects: {
      onProvisionProgress: nativeApi.onProvisionProgress,
    },
  }),
}));

import { CreateProjectDialog } from "./CreateProjectDialog";

describe("CreateProjectDialog GitHub source", () => {
  afterEach(() => {
    nativeApi.onProvisionProgress.mockClear();
  });

  it("keeps the default Add Project modal shell", async () => {
    await render(
      <CreateProjectDialog
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(document.querySelector('[data-slot="dialog-backdrop"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="create-project-dock"]')).toBeNull();
  });

  it("disables GitHub when the server does not advertise provisioning", async () => {
    await render(
      <CreateProjectDialog
        open
        githubProvisioningAvailable={false}
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      (page.getByRole("radio", { name: "GitHub" }).element() as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("derives the clone folder from owner/repository and submits a parent directory", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    await render(
      <CreateProjectDialog
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("radio", { name: "GitHub" }).click();
    expect(document.body.textContent).toContain("What you need");
    expect(document.body.textContent).toContain("Private access");
    await page.getByLabelText("Repository").fill("openai/codex");

    expect((page.getByLabelText("Folder name").element() as HTMLInputElement).value).toBe("codex");
    expect(document.body.textContent).toContain("Final location: /Users/test/Developer/codex");

    await page.getByRole("button", { name: "Clone and add" }).click();
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const [value, options] = onSubmit.mock.calls[0] ?? [];
    expect(value).toMatchObject({
      source: "github",
      operation: "clone",
      forkDestinationOwner: null,
      repository: "openai/codex",
      destinationParent: "/Users/test/Developer",
      directoryName: "codex",
      spaceId: null,
    });
    expect(value.operationId).toEqual(expect.any(String));
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("submits fork-and-clone separately with an optional destination owner", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await render(
      <CreateProjectDialog
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("radio", { name: "GitHub" }).click();
    expect(page.getByRole("radio", { name: /Clone directly/ }).element()).toBeChecked();
    await page.getByRole("radio", { name: /Fork and clone/ }).click();
    await page.getByLabelText(/Fork destination/).fill("example-org");
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByRole("button", { name: "Fork and add" }).click();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      source: "github",
      operation: "fork-and-clone",
      forkDestinationOwner: "example-org",
      repository: "openai/codex",
    });
  });

  it("rejects invalid clone folder names before provisioning", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await render(
      <CreateProjectDialog
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("radio", { name: "GitHub" }).click();
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByLabelText("Folder name").fill("CON");
    await page.getByRole("button", { name: "Clone and add" }).click();

    await expect.element(page.getByRole("alert")).toHaveTextContent("Choose a valid folder name");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("preserves form state and retries an actionable typed failure with a new operation id", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(
        new GitHubProjectProvisionError({
          operationId: "server-operation-placeholder",
          stage: "clone",
          code: "CLONE_TRANSPORT_FAILED",
          summary: "Forkara could not reach GitHub while cloning.",
          correctiveAction: "Check the server network connection and retry.",
          technicalDetails: "connection reset by peer",
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(undefined);
    await render(
      <CreateProjectDialog
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("radio", { name: "GitHub" }).click();
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByLabelText("Clone into").fill("/tmp/projects");
    await page.getByLabelText("Folder name").fill("codex-checkout");
    await page.getByRole("button", { name: "Clone and add" }).click();

    const alert = page.getByRole("alert", { name: "Operation failed" });
    await expect.element(alert).toBeVisible();
    expect(alert.element().textContent).toContain("Check the server network connection");
    expect((page.getByLabelText("Repository").element() as HTMLInputElement).value).toBe(
      "openai/codex",
    );
    expect((page.getByLabelText("Clone into").element() as HTMLInputElement).value).toBe(
      "/tmp/projects",
    );
    expect((page.getByLabelText("Folder name").element() as HTMLInputElement).value).toBe(
      "codex-checkout",
    );
    await page.getByRole("button", { name: "Technical details" }).click();
    expect(alert.element().textContent).toContain("connection reset by peer");

    await page.getByRole("button", { name: "Retry" }).click();
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    const first = onSubmit.mock.calls[0]?.[0];
    const retry = onSubmit.mock.calls[1]?.[0];
    expect(retry).toMatchObject({
      repository: first.repository,
      destinationParent: first.destinationParent,
      directoryName: first.directoryName,
      operation: first.operation,
      spaceId: first.spaceId,
    });
    expect(retry.operationId).not.toBe(first.operationId);
  });

  it("dismisses a non-retryable typed failure without replacing it with local validation copy", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new GitHubProjectProvisionError({
        operationId: "operation-auth",
        stage: "access",
        code: "GITHUB_AUTH_INVALID",
        summary: "GitHub rejected the configured credentials.",
        correctiveAction: "Refresh the GitHub credentials on this server.",
        technicalDetails: null,
        retryable: false,
      }),
    );
    await render(
      <CreateProjectDialog
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/Users/test/Developer"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await page.getByRole("radio", { name: "GitHub" }).click();
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByRole("button", { name: "Clone and add" }).click();
    await expect
      .element(page.getByRole("alert", { name: "Operation failed" }))
      .toHaveTextContent("Refresh the GitHub credentials");
    expect(page.getByRole("button", { name: "Retry" }).query()).toBeNull();
    await page.getByRole("button", { name: "Dismiss" }).click();
    expect(page.getByRole("alert", { name: "Operation failed" }).query()).toBeNull();
    expect((page.getByLabelText("Repository").element() as HTMLInputElement).value).toBe(
      "openai/codex",
    );
  });

  it("aborts the active clone when the dialog is closed", async () => {
    const submittedSignals: AbortSignal[] = [];
    const onSubmit = vi.fn(
      (_value: unknown, options: { signal: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          submittedSignals.push(options.signal);
          options.signal.addEventListener("abort", () => reject(new Error("cancelled")), {
            once: true,
          });
        }),
    );
    const onOpenChange = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <CreateProjectDialog
          open={open}
          githubProvisioningAvailable
          spaces={[]}
          activeSpaceId={null}
          defaultCloneParent="/Users/test"
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen);
            setOpen(nextOpen);
          }}
          onSubmit={onSubmit}
        />
      );
    }
    await render(<Harness />);

    await page.getByRole("radio", { name: "GitHub" }).click();
    await page.getByLabelText("Repository").fill("openai/codex");
    await page.getByRole("button", { name: "Clone and add" }).click();
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    await page.getByRole("button", { name: "Cancel clone" }).click();

    expect(submittedSignals[0]?.aborted).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
