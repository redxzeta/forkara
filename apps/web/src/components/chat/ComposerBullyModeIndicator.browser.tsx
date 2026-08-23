// FILE: ComposerBullyModeIndicator.browser.tsx
// Purpose: Verifies visible, accessible Bully Mode composer state and its quick disable action.
// Layer: Browser UI test

import "../../index.css";

import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ComposerBullyModeIndicator } from "./ComposerBullyModeIndicator";

describe("ComposerBullyModeIndicator", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is absent when disabled", async () => {
    const screen = await render(
      <ComposerBullyModeIndicator enabled={false} onEnabledChange={() => undefined} />,
    );
    try {
      await expect.element(page.getByText("Bully Mode")).not.toBeInTheDocument();
    } finally {
      await screen.unmount();
    }
  });

  it("shows a text indicator and disables the shared setting when activated", async () => {
    const onEnabledChange = vi.fn();
    const screen = await render(
      <ComposerBullyModeIndicator enabled={true} onEnabledChange={onEnabledChange} />,
    );
    try {
      const indicator = page.getByRole("button", { name: "Disable Bully Mode" });
      await expect.element(indicator).toHaveAttribute("aria-pressed", "true");
      await expect.element(page.getByText("Bully Mode")).toBeVisible();
      await indicator.hover();
      await expect.element(page.getByText(/changes response tone only/u)).toBeVisible();
      await indicator.click();
      expect(onEnabledChange).toHaveBeenCalledWith(false);
    } finally {
      await screen.unmount();
    }
  });
});
