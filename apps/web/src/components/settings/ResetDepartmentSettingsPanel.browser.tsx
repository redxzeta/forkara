// FILE: ResetDepartmentSettingsPanel.browser.tsx
// Purpose: Keyboard-access coverage for the non-operational Reset Department controls.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ResetDepartmentSettingsPanel } from "./ResetDepartmentSettingsPanel";

function resetApi(operationState: "none" | "merge" | "rebase" | "unknown" = "none") {
  const impact = {
    repositoryState: "ready" as const,
    workspaceRoot: "/workspace",
    repositoryRoot: "/workspace",
    repositoryIdentity: "a".repeat(64),
    branch: "main",
    detached: false,
    head: "0123456789abcdef",
    stagedTracked: ["staged.txt"],
    unstagedTracked: ["dirty.txt"],
    untracked: ["untracked.txt"],
    conflicts: [],
    operationState,
    fingerprint: "b".repeat(64),
  };
  return {
    previewDependencyCleanup: vi.fn(async () => ({
      workspaceRoot: "/workspace",
      targetPath: "/workspace/node_modules",
      state: "ready" as const,
      packageManager: "bun" as const,
      installCommand: "bun install",
    })),
    executeDependencyCleanup: vi.fn(async () => ({
      workspaceRoot: "/workspace",
      targetPath: "/workspace/node_modules",
      state: "missing" as const,
      packageManager: "bun" as const,
      installCommand: "bun install",
      removed: true,
    })),
    inspectHardResetImpact: vi.fn(async () => impact),
    stashHardResetChanges: vi.fn(async () => ({
      status: "stashed" as const,
      snapshot: {
        ...impact,
        stagedTracked: [],
        unstagedTracked: [],
        untracked: [],
        fingerprint: "c".repeat(64),
      },
    })),
    executeHardReset: vi.fn(async () => ({
      status: "reset-completed" as const,
      snapshot: {
        ...impact,
        stagedTracked: [],
        unstagedTracked: [],
        conflicts: [],
        operationState: "none" as const,
        fingerprint: "d".repeat(64),
      },
    })),
  };
}

describe("ResetDepartmentSettingsPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps every action keyboard reachable and identifies the quota ritual as parody", async () => {
    await render(
      <ResetDepartmentSettingsPanel active workspaceRoot="/workspace" resetApi={resetApi()} />,
    );

    const oracle = page.getByRole("button", { name: "Ask the Reset Oracle — SAFE" });
    const dependencies = page.getByRole("button", {
      name: "Preview Delete node_modules — LOW RISK",
    });
    const hardReset = page.getByRole("button", {
      name: "Inspect git reset --hard impact — DANGER",
    });
    const quota = page.getByRole("button", { name: "Reset Codex Quota — LOL parody" });

    oracle.element().focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(dependencies.element());
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(hardReset.element());
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(quota.element());

    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() =>
      expect(page.getByRole("status").element().textContent).toContain(
        "This is a parody; no Codex quota or account state changed.",
      ),
    );
  });

  it("shows factual reset impact with safer actions before guarded execution", async () => {
    const api = resetApi();
    await render(<ResetDepartmentSettingsPanel active workspaceRoot="/workspace" resetApi={api} />);

    await userEvent.click(
      page.getByRole("button", { name: "Inspect git reset --hard impact — DANGER" }),
    );
    await vi.waitFor(() =>
      expect(api.inspectHardResetImpact).toHaveBeenCalledWith({ cwd: "/workspace" }),
    );
    expect(document.body.textContent).toContain("Staged tracked: 1");
    expect(document.body.textContent).toContain("Unstaged tracked: 1");
    expect(document.body.textContent).toContain("Untracked: 1");
    expect(document.body.textContent).toContain("Untracked files would remain.");
    expect(document.body.textContent).toContain(
      "Stash includes staged, unstaged, and untracked changes. Ignored files are excluded.",
    );
    await expect.element(page.getByRole("button", { name: "Stash Changes Instead" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Continue to Hard Reset" }))
      .toBeVisible();
    await expect
      .element(page.getByLabelText("Type git has receipts exactly to continue"))
      .toBeVisible();
    expect(
      page
        .getByRole("button", { name: "Stash Changes Instead" })
        .element()
        .compareDocumentPosition(
          page.getByRole("button", { name: "Continue to Hard Reset" }).element(),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("requires exact confirmation, refreshes facts, and preserves untracked-file disclosure", async () => {
    const api = resetApi();
    await render(<ResetDepartmentSettingsPanel active workspaceRoot="/workspace" resetApi={api} />);

    await userEvent.click(
      page.getByRole("button", { name: "Inspect git reset --hard impact — DANGER" }),
    );
    const confirmation = page.getByLabelText("Type git has receipts exactly to continue");
    const continueButton = page.getByRole("button", { name: "Continue to Hard Reset" });
    await userEvent.fill(confirmation, "Git has receipts");
    await expect.element(continueButton).toBeDisabled();
    await userEvent.fill(confirmation, "git has receipts");
    await expect.element(continueButton).toBeEnabled();
    await userEvent.click(continueButton);

    await vi.waitFor(() =>
      expect(api.executeHardReset).toHaveBeenCalledWith({
        cwd: "/workspace",
        expectedRepositoryIdentity: "a".repeat(64),
        expectedHead: "0123456789abcdef",
        expectedFingerprint: "b".repeat(64),
        confirmation: "git has receipts",
      }),
    );
    expect(page.getByRole("status").element().textContent).toContain(
      "Untracked and ignored files were not removed.",
    );
    expect(document.body.textContent).toContain("Staged tracked: 0");
    expect(document.body.textContent).toContain("Unstaged tracked: 0");
    expect(document.body.textContent).toContain("Untracked: 1");
    await expect.element(confirmation).toHaveValue("");
  });

  it("clears confirmation on refreshed inspection and blocks an unknown operation state", async () => {
    const api = resetApi("unknown");
    await render(<ResetDepartmentSettingsPanel active workspaceRoot="/workspace" resetApi={api} />);

    await userEvent.click(
      page.getByRole("button", { name: "Inspect git reset --hard impact — DANGER" }),
    );
    const confirmation = page.getByLabelText("Type git has receipts exactly to continue");
    await expect.element(confirmation).toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "Continue to Hard Reset" }))
      .toBeDisabled();
    expect(document.body.textContent).toContain(
      "The active merge/rebase state could not be determined. Hard reset is blocked.",
    );

    const knownApi = resetApi("merge");
    document.body.innerHTML = "";
    await render(
      <ResetDepartmentSettingsPanel active workspaceRoot="/workspace" resetApi={knownApi} />,
    );
    await userEvent.click(
      page.getByRole("button", { name: "Inspect git reset --hard impact — DANGER" }),
    );
    const knownConfirmation = page.getByLabelText("Type git has receipts exactly to continue");
    await userEvent.fill(knownConfirmation, "git has receipts");
    await userEvent.click(
      page.getByRole("button", { name: "Refresh git reset --hard impact — DANGER" }),
    );
    await expect.element(knownConfirmation).toHaveValue("");
    expect(document.body.textContent).toContain("Repository operation: merge.");
  });

  it("stashes only the currently inspected snapshot and refreshes the displayed state", async () => {
    const api = resetApi();
    await render(<ResetDepartmentSettingsPanel active workspaceRoot="/workspace" resetApi={api} />);

    await userEvent.click(
      page.getByRole("button", { name: "Inspect git reset --hard impact — DANGER" }),
    );
    await userEvent.click(page.getByRole("button", { name: "Stash Changes Instead" }));
    await vi.waitFor(() =>
      expect(api.stashHardResetChanges).toHaveBeenCalledWith({
        cwd: "/workspace",
        expectedRepositoryIdentity: "a".repeat(64),
        expectedHead: "0123456789abcdef",
        expectedFingerprint: "b".repeat(64),
      }),
    );
    expect(page.getByRole("status").element().textContent).toContain(
      "Crisis postponed successfully.",
    );
    expect(document.body.textContent).toContain("Nothing to stash.");
  });

  it("clears a failed stash preview and blocks progression until refresh", async () => {
    const api = resetApi();
    api.stashHardResetChanges.mockRejectedValueOnce(new Error("Stash refused."));
    await render(<ResetDepartmentSettingsPanel active workspaceRoot="/workspace" resetApi={api} />);

    await userEvent.click(
      page.getByRole("button", { name: "Inspect git reset --hard impact — DANGER" }),
    );
    await userEvent.click(page.getByRole("button", { name: "Stash Changes Instead" }));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "Further progress is blocked until a fresh inspection succeeds.",
      ),
    );
    await expect
      .element(page.getByRole("button", { name: "Stash Changes Instead" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Refresh git reset --hard impact — DANGER" }))
      .toBeVisible();
  });

  it("requires an exact-path preview before executing cleanup", async () => {
    const api = resetApi();
    await render(<ResetDepartmentSettingsPanel active workspaceRoot="/workspace" resetApi={api} />);

    await userEvent.click(
      page.getByRole("button", { name: "Preview Delete node_modules — LOW RISK" }),
    );
    await vi.waitFor(() =>
      expect(api.previewDependencyCleanup).toHaveBeenCalledWith({ cwd: "/workspace" }),
    );
    expect(api.executeDependencyCleanup).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("/workspace/node_modules");
    expect(document.body.textContent).toContain("bun install");
    expect(document.body.textContent).toContain("Forkara will not run it.");

    await userEvent.click(page.getByRole("button", { name: "Delete node_modules" }));
    await vi.waitFor(() =>
      expect(api.executeDependencyCleanup).toHaveBeenCalledWith({ cwd: "/workspace" }),
    );
    expect(document.body.textContent).toContain("Dependencies successfully forgotten.");
  });

  it("invokes the Oracle from the keyboard with a deterministic rare result", async () => {
    await render(<ResetDepartmentSettingsPanel active random={() => 0} />);

    const oracle = page.getByRole("button", { name: "Ask the Reset Oracle — SAFE" });
    oracle.element().focus();
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(page.getByRole("status").element().textContent).toContain("DO NOT RESET ANYTHING."),
    );
    expect(document.body.textContent).toContain("DO NOT RESET ANYTHING.");
  });
});
