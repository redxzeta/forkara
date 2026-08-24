import "../../index.css";

import type { MergeFlexReceiptsResult, XConnectionStatus } from "@forkara/contracts";
import { page } from "vitest/browser";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MERGE_FLEX_PARODY_MARKER } from "~/lib/mergeFlexComposer";
import { MergeFlexComposerDialog } from "./MergeFlexComposerDialog";

function factualResult(
  scope: MergeFlexReceiptsResult["scope"] = { type: "all" },
): MergeFlexReceiptsResult {
  const repository = scope.type === "repository" ? scope.repository : "acme/widgets";
  return {
    date: "2026-08-24",
    startedAt: "2026-08-24T07:00:00.000Z",
    endedAt: "2026-08-25T07:00:00.000Z",
    scope,
    viewer: "octocat",
    count: 1,
    incomplete: false,
    receipts: [
      {
        number: 42,
        title: "Ship factual receipts",
        url: `https://github.com/${repository}/pull/42`,
        repository,
        repositoryVisibility: "public",
        authorLogin: "octocat",
        mergedAt: "2026-08-24T18:00:00.000Z",
      },
    ],
  };
}

function connectedStatus(): XConnectionStatus {
  return {
    state: "connected",
    redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
    handle: "octocat",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("MergeFlexComposerDialog", () => {
  it("requires an explicit submit, blocks duplicate posting, and shows success", async () => {
    const pendingPost = deferred<{ id: string; text: string; url: string }>();
    const onPost = vi.fn(() => pendingPost.promise);
    const onOpenPost = vi.fn().mockResolvedValue(undefined);
    await render(
      <MergeFlexComposerDialog
        open
        result={factualResult()}
        connectionStatus={connectedStatus()}
        authorizationUrl={null}
        onOpenChange={vi.fn()}
        onBeginConnect={vi.fn().mockResolvedValue(undefined)}
        onRetryConnectionStatus={vi.fn().mockResolvedValue(undefined)}
        onOpenAuthorization={vi.fn().mockResolvedValue(undefined)}
        onPost={onPost}
        onOpenPost={onOpenPost}
      />,
    );

    expect(onPost).not.toHaveBeenCalled();
    const editor = page.getByLabelText("Post text");
    await editor.fill("A reviewed factual draft");
    const postButton = page.getByRole("button", { name: "Post to X" });
    const postElement = postButton.element() as HTMLButtonElement;
    postElement.click();
    postElement.click();

    await vi.waitFor(() => expect(onPost).toHaveBeenCalledOnce());
    expect(onPost).toHaveBeenCalledWith("A reviewed factual draft");
    expect(postElement.disabled).toBe(true);

    pendingPost.resolve({
      id: "123",
      text: "A reviewed factual draft",
      url: "https://x.com/i/web/status/123",
    });
    await expect.element(page.getByRole("status")).toHaveTextContent("Posted to X");
    await page.getByRole("button", { name: "Open post" }).click();
    expect(onOpenPost).toHaveBeenCalledWith("https://x.com/i/web/status/123");
  });

  it("preserves an edited draft and exposes an accessible posting failure", async () => {
    const onPost = vi.fn().mockRejectedValue(new Error("X is rate limited. Try again later."));
    await render(
      <MergeFlexComposerDialog
        open
        result={factualResult()}
        connectionStatus={connectedStatus()}
        authorizationUrl={null}
        onOpenChange={vi.fn()}
        onBeginConnect={vi.fn().mockResolvedValue(undefined)}
        onRetryConnectionStatus={vi.fn().mockResolvedValue(undefined)}
        onOpenAuthorization={vi.fn().mockResolvedValue(undefined)}
        onPost={onPost}
        onOpenPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const editor = page.getByLabelText("Post text");
    await editor.fill("Keep this exact draft 🍴");
    await page.getByRole("button", { name: "Post to X" }).click();

    await expect.element(page.getByRole("alert")).toHaveTextContent("X is rate limited");
    expect((editor.element() as HTMLTextAreaElement).value).toBe("Keep this exact draft 🍴");
    await expect.element(page.getByText("23 characters")).toBeInTheDocument();
    expect(
      (page.getByRole("button", { name: "Post to X" }).element() as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("keeps repository identity opt-in and retains the draft while connecting", async () => {
    const beginConnect = vi.fn().mockResolvedValue(undefined);

    function Harness() {
      const [status, setStatus] = useState<XConnectionStatus>({
        state: "disconnected",
        redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
      });
      return (
        <MergeFlexComposerDialog
          open
          result={factualResult({ type: "repository", repository: "acme/widgets" })}
          connectionStatus={status}
          authorizationUrl={null}
          onOpenChange={vi.fn()}
          onBeginConnect={async () => {
            await beginConnect();
            setStatus(connectedStatus());
          }}
          onRetryConnectionStatus={vi.fn().mockResolvedValue(undefined)}
          onOpenAuthorization={vi.fn().mockResolvedValue(undefined)}
          onPost={vi.fn().mockResolvedValue({
            id: "123",
            text: "Edited locally",
            url: "https://x.com/i/web/status/123",
          })}
          onOpenPost={vi.fn().mockResolvedValue(undefined)}
        />
      );
    }

    await render(<Harness />);
    const editor = page.getByLabelText("Post text");
    expect((editor.element() as HTMLTextAreaElement).value).not.toContain("acme/widgets");
    await page.getByRole("checkbox", { name: /Include acme\/widgets/ }).click();
    expect((editor.element() as HTMLTextAreaElement).value).toContain("acme/widgets");

    await editor.fill("Edited locally while connecting");
    await page.getByRole("button", { name: "Connect X account" }).click();
    await vi.waitFor(() => expect(beginConnect).toHaveBeenCalledOnce());
    expect((editor.element() as HTMLTextAreaElement).value).toBe("Edited locally while connecting");
    expect(
      (page.getByRole("button", { name: "Post to X" }).element() as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("recovers inherited pending authorization and failed status loading", async () => {
    const restartAuthorization = vi.fn().mockResolvedValue(undefined);
    const retryStatus = vi.fn().mockResolvedValue(undefined);
    const { unmount } = await render(
      <MergeFlexComposerDialog
        open
        result={factualResult()}
        connectionStatus={{
          state: "connecting",
          redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
          authorizationExpiresAt: "2026-08-24T18:05:00.000Z",
        }}
        authorizationUrl={null}
        onOpenChange={vi.fn()}
        onBeginConnect={restartAuthorization}
        onRetryConnectionStatus={retryStatus}
        onOpenAuthorization={vi.fn().mockResolvedValue(undefined)}
        onPost={vi.fn().mockResolvedValue({
          id: "123",
          text: "reviewed",
          url: "https://x.com/i/web/status/123",
        })}
        onOpenPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await page.getByRole("button", { name: "Restart X authorization" }).click();
    expect(restartAuthorization).toHaveBeenCalledOnce();
    unmount();

    await render(
      <MergeFlexComposerDialog
        open
        result={factualResult()}
        connectionStatus={null}
        connectionLoadError={new Error("transport unavailable")}
        authorizationUrl={null}
        onOpenChange={vi.fn()}
        onBeginConnect={restartAuthorization}
        onRetryConnectionStatus={retryStatus}
        onOpenAuthorization={vi.fn().mockResolvedValue(undefined)}
        onPost={vi.fn().mockResolvedValue({
          id: "123",
          text: "reviewed",
          url: "https://x.com/i/web/status/123",
        })}
        onOpenPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await page.getByRole("button", { name: "Retry connection status" }).click();
    expect(retryStatus).toHaveBeenCalledOnce();
  });

  it("isolates factual and parody drafts while enforcing the final parody payload", async () => {
    const onPost = vi.fn().mockImplementation(async (text: string) => ({
      id: "456",
      text,
      url: "https://x.com/i/web/status/456",
    }));
    await render(
      <MergeFlexComposerDialog
        open
        result={factualResult()}
        connectionStatus={connectedStatus()}
        authorizationUrl={null}
        onOpenChange={vi.fn()}
        onBeginConnect={vi.fn().mockResolvedValue(undefined)}
        onRetryConnectionStatus={vi.fn().mockResolvedValue(undefined)}
        onOpenAuthorization={vi.fn().mockResolvedValue(undefined)}
        onPost={onPost}
        onOpenPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const editor = page.getByLabelText("Post text");
    await editor.fill("Edited factual receipt");
    await page.getByRole("radio", { name: "Resume-Driven Development" }).click();
    await expect.element(page.getByText("PARODY · SOURCE: VIBES")).toBeInTheDocument();

    const allegedCount = page.getByLabelText("Alleged PRs merged today");
    await allegedCount.fill("1000000");
    await expect.element(page.getByRole("alert")).toHaveTextContent("Enter a whole number");
    expect(
      (page.getByRole("button", { name: "Post parody to X" }).element() as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await page.getByRole("button", { name: "42", exact: true }).click();
    expect((allegedCount.element() as HTMLInputElement).value).toBe("42");
    await editor.fill("Custom boast with no disclaimer");
    await expect.element(page.getByText(MERGE_FLEX_PARODY_MARKER)).toBeInTheDocument();

    await page.getByRole("radio", { name: "Receipts · factual" }).click();
    expect((editor.element() as HTMLTextAreaElement).value).toBe("Edited factual receipt");
    await page.getByRole("radio", { name: "Resume-Driven Development" }).click();
    expect((editor.element() as HTMLTextAreaElement).value).toBe("Custom boast with no disclaimer");

    await page.getByRole("button", { name: "Post parody to X" }).click();
    await vi.waitFor(() => expect(onPost).toHaveBeenCalledOnce());
    expect(onPost).toHaveBeenCalledWith(
      `Custom boast with no disclaimer\n\n${MERGE_FLEX_PARODY_MARKER}`,
    );
    await expect.element(page.getByRole("status")).toHaveTextContent("Posted parody to X");
  });
});
