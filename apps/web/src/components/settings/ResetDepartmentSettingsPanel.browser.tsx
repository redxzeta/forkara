// FILE: ResetDepartmentSettingsPanel.browser.tsx
// Purpose: Keyboard-access coverage for the non-operational Reset Department controls.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ResetDepartmentSettingsPanel } from "./ResetDepartmentSettingsPanel";

describe("ResetDepartmentSettingsPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps every action keyboard reachable and identifies the quota ritual as parody", async () => {
    await render(<ResetDepartmentSettingsPanel active />);

    const oracle = page.getByRole("button", { name: "Ask the Reset Oracle — SAFE" });
    const dependencies = page.getByRole("button", {
      name: "Delete node_modules — LOW RISK placeholder",
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
