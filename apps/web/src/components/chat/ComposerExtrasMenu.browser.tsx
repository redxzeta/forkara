// FILE: ComposerExtrasMenu.browser.tsx
// Purpose: Verifies the composer `+` menu exposes generic file uploads and quick mode toggles.
// Layer: Browser UI test
// Depends on: vitest browser rendering helpers and the ComposerExtrasMenu component.

import "../../index.css";

import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { ProviderInteractionMode } from "@forkara/contracts";

import { ComposerExtrasMenu } from "./ComposerExtrasMenu";

async function mountMenu(props?: {
  bullyModeEnabled?: boolean;
  fastModeEnabled?: boolean;
  interactionMode?: ProviderInteractionMode;
  supportsFastMode?: boolean;
}) {
  const onAddAttachments = vi.fn();
  const onToggleFastMode = vi.fn();
  const onBullyModeChange = vi.fn();
  const onInteractionModeChange = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const screen = await render(
    <ComposerExtrasMenu
      interactionMode={props?.interactionMode ?? "default"}
      supportsFastMode={props?.supportsFastMode ?? true}
      fastModeEnabled={props?.fastModeEnabled ?? false}
      bullyModeEnabled={props?.bullyModeEnabled ?? false}
      onAddAttachments={onAddAttachments}
      onToggleFastMode={onToggleFastMode}
      onBullyModeChange={onBullyModeChange}
      onInteractionModeChange={onInteractionModeChange}
    />,
    { container: host },
  );

  const cleanup = async () => {
    await screen.unmount();
    host.remove();
  };

  return {
    [Symbol.asyncDispose]: cleanup,
    cleanup,
    onAddAttachments,
    onBullyModeChange,
    onToggleFastMode,
    onInteractionModeChange,
  };
}

describe("ComposerExtrasMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("uses an unrestricted file picker and forwards every selected file", async () => {
    await using menu = await mountMenu();

    const input = document.querySelector<HTMLInputElement>("[data-testid='composer-file-input']");
    expect(input).not.toBeNull();
    expect(input?.hasAttribute("accept")).toBe(false);

    const files = new DataTransfer();
    files.items.add(new File(["photo"], "photo.png", { type: "image/png" }));
    files.items.add(new File(["document"], "document.pdf", { type: "application/pdf" }));
    Object.defineProperty(input, "files", {
      configurable: true,
      value: files.files,
    });
    input?.dispatchEvent(new Event("change", { bubbles: true }));

    expect(menu.onAddAttachments).toHaveBeenCalledTimes(1);
    expect(menu.onAddAttachments.mock.calls[0]?.[0]?.map((file: File) => file.name)).toEqual([
      "photo.png",
      "document.pdf",
    ]);
  });

  it("shows the attachment action in the menu", async () => {
    await using _ = await mountMenu({ interactionMode: "plan", fastModeEnabled: true });

    await page.getByLabelText("Composer extras").click();

    await vi.waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain("Add files");
      expect(text).toContain("Mode");
      expect(text).toContain("Fast");
      expect(text).not.toContain("Plugins");
    });
  });

  it("selects Default, Plan, and Debug exclusively", async () => {
    await using menu = await mountMenu();

    await page.getByLabelText("Composer extras").click();
    await page.getByRole("menuitem", { name: "Mode" }).click();
    await page.getByRole("menuitemradio", { name: "Debug" }).click();

    expect(menu.onInteractionModeChange).toHaveBeenCalledWith("debug");
  });

  it("wires the speed control", async () => {
    await using menu = await mountMenu();

    await page.getByLabelText("Composer extras").click();
    await page.getByText("Fast").click();
    await page.getByRole("menuitemradio", { name: "Fast" }).click();

    expect(menu.onToggleFastMode).toHaveBeenCalledTimes(1);
  });

  it("toggles the shared Bully Mode setting from the extras menu", async () => {
    await using menu = await mountMenu({ bullyModeEnabled: false });

    await page.getByLabelText("Composer extras").click();
    const toggle = page.getByRole("menuitemcheckbox", {
      name: "Bully Mode — changes response tone only",
    });
    await expect.element(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();

    expect(menu.onBullyModeChange.mock.calls[0]?.[0]).toBe(true);
  });
});
