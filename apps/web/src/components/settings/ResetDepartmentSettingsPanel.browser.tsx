// FILE: ResetDepartmentSettingsPanel.browser.tsx
// Purpose: Keyboard-access coverage for the non-operational Reset Department controls.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ResetDepartmentSettingsPanel } from "./ResetDepartmentSettingsPanel";

function resetApi() {
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
    operationState: "none" as const,
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

  it("shows factual tracked and untracked reset impact without exposing execution", async () => {
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
    expect(document.body.textContent).not.toContain("Continue to Hard Reset");
    expect(document.body.textContent).not.toContain("git has receipts");
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
    await expect.element(page.getByRole("button", { name: "Refresh impact" })).toBeVisible();
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
