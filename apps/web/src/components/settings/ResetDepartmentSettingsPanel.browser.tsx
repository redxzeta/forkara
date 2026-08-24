// FILE: ResetDepartmentSettingsPanel.browser.tsx
// Purpose: Keyboard-access coverage for the non-operational Reset Department controls.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ResetDepartmentSettingsPanel } from "./ResetDepartmentSettingsPanel";

function resetApi() {
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
      name: "git reset --hard — DANGER placeholder",
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
