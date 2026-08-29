import "../../index.css";

import type { MergeFlexReceiptsResult, XConnectionStatus } from "@forkara/contracts";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MERGE_FLEX_PARODY_MARKER } from "~/lib/mergeFlexComposer";
import { MergeFlexComposerDialog } from "./MergeFlexComposerDialog";

const FACTUAL_RESULT: MergeFlexReceiptsResult = {
  date: "2026-08-24",
  startedAt: "2026-08-24T07:00:00.000Z",
  endedAt: "2026-08-25T07:00:00.000Z",
  scope: { type: "all" },
  viewer: "octocat",
  count: 1,
  incomplete: false,
  receipts: [
    {
      number: 42,
      title: "Ship factual receipts",
      url: "https://github.com/acme/widgets/pull/42",
      repository: "acme/widgets",
      repositoryVisibility: "public",
      authorLogin: "octocat",
      mergedAt: "2026-08-24T18:00:00.000Z",
    },
  ],
};

const CONNECTED_STATUS: XConnectionStatus = {
  state: "connected",
  redirectUri: "http://127.0.0.1:3773/oauth/x/callback",
  handle: "octocat",
};

describe("MergeFlexComposerDialog parody mode", () => {
  it("[personality-smoke] isolates factual receipts from Enterprise velocity without publishing", async () => {
    const onPost = vi.fn();
    await render(
      <MergeFlexComposerDialog
        open
        result={FACTUAL_RESULT}
        connectionStatus={CONNECTED_STATUS}
        authorizationUrl={null}
        onOpenChange={vi.fn()}
        onBeginConnect={vi.fn().mockResolvedValue(undefined)}
        onRetryConnectionStatus={vi.fn().mockResolvedValue(undefined)}
        onOpenAuthorization={vi.fn().mockResolvedValue(undefined)}
        onPost={onPost}
        onOpenPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await expect
      .element(page.getByLabelText(/FACTUAL RECEIPTS: 1 your prs merged today/i))
      .toBeInTheDocument();
    await page.getByRole("radio", { name: "Resume-Driven Development" }).click();
    await page.getByRole("button", { name: "Enterprise velocity" }).click();

    await expect
      .element(page.getByRole("spinbutton", { name: "Alleged PRs merged today" }))
      .toHaveValue(999_999);
    await expect.element(page.getByText(MERGE_FLEX_PARODY_MARKER)).toBeInTheDocument();
    expect(document.body.textContent).toContain(
      "Alleged counts never create pull requests, commits, branches, or GitHub activity.",
    );

    await page.getByRole("radio", { name: "Receipts · factual" }).click();
    await expect
      .element(page.getByLabelText(/FACTUAL RECEIPTS: 1 your prs merged today/i))
      .toBeInTheDocument();
    expect(onPost).not.toHaveBeenCalled();
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
        result={FACTUAL_RESULT}
        connectionStatus={CONNECTED_STATUS}
        authorizationUrl={null}
        onOpenChange={vi.fn()}
        onBeginConnect={vi.fn().mockResolvedValue(undefined)}
        onRetryConnectionStatus={vi.fn().mockResolvedValue(undefined)}
        onOpenAuthorization={vi.fn().mockResolvedValue(undefined)}
        onPost={onPost}
        onOpenPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const factualCard = page.getByLabelText(/FACTUAL RECEIPTS: 1 your prs merged today/i);
    await expect.element(factualCard).toBeInTheDocument();
    const factualCardElement = factualCard.element() as HTMLElement;
    expect(factualCardElement.offsetWidth).toBe(1200);
    expect(factualCardElement.offsetHeight).toBe(675);
    expect(factualCardElement.textContent).toContain("FACTUAL RECEIPTS");
    const editor = page.getByLabelText("Post text");
    await editor.fill("Edited factual receipt");
    await page.getByRole("radio", { name: "Resume-Driven Development" }).click();
    await expect.element(page.getByText("ALLEGED RECEIPTS")).toBeInTheDocument();

    const allegedCount = page.getByRole("spinbutton", { name: "Alleged PRs merged today" });
    await allegedCount.fill("1000000");
    await expect.element(page.getByRole("alert")).toHaveTextContent("Enter a whole number");
    expect(
      (page.getByRole("button", { name: "Post to X" }).element() as HTMLButtonElement).disabled,
    ).toBe(true);

    await page.getByRole("button", { name: "42", exact: true }).click();
    expect((allegedCount.element() as HTMLInputElement).value).toBe("42");
    const parodyCard = page.getByLabelText(/PARODY: 42 alleged prs merged today/i);
    await expect.element(parodyCard).toBeInTheDocument();
    const parodyCardText = (parodyCard.element() as HTMLElement).textContent;
    expect(parodyCardText).toContain("RESUME-DRIVEN DEVELOPMENT");
    expect(parodyCardText).toContain("PARODY");
    await editor.fill("Custom boast with no disclaimer");
    await expect.element(page.getByText(MERGE_FLEX_PARODY_MARKER)).toBeInTheDocument();

    await page.getByRole("radio", { name: "Receipts · factual" }).click();
    expect((editor.element() as HTMLTextAreaElement).value).toBe("Edited factual receipt");
    await page.getByRole("radio", { name: "Resume-Driven Development" }).click();
    expect((editor.element() as HTMLTextAreaElement).value).toBe("Custom boast with no disclaimer");

    await page.getByRole("button", { name: "Post to X" }).click();
    await vi.waitFor(() => expect(onPost).toHaveBeenCalledOnce());
    expect(onPost).toHaveBeenCalledWith(
      `Custom boast with no disclaimer\n\n${MERGE_FLEX_PARODY_MARKER}`,
    );
    await expect.element(page.getByRole("status")).toHaveTextContent("Posted to X");
  });
});
