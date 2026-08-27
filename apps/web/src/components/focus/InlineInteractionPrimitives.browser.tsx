// FILE: InlineInteractionPrimitives.browser.tsx
// Purpose: Accessibility and explicit-decision coverage for non-modal focus primitives.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { InlineConfirmation } from "./InlineConfirmation";
import { InlineOperationError } from "./InlineOperationError";

describe("focus-mode inline interaction primitives", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("discloses technical details and exposes retry and dismiss actions", async () => {
    const retry = vi.fn();
    const dismiss = vi.fn();
    await render(
      <InlineOperationError
        summary="Clone failed"
        correctiveAction="Check repository access and retry."
        technicalDetails="safe transport diagnostic"
        onRetry={retry}
        onDismiss={dismiss}
      />,
    );

    const alert = page.getByRole("alert", { name: "Operation failed" });
    await expect.element(alert).toBeVisible();
    const disclosure = page.getByRole("button", { name: "Technical details" });
    await expect.element(disclosure).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(disclosure);
    await expect.element(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(alert.element().textContent).toContain("safe transport diagnostic");

    await userEvent.click(page.getByRole("button", { name: "Retry" }));
    await userEvent.click(page.getByRole("button", { name: "Dismiss" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("never runs a destructive action until the user explicitly confirms", async () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    await render(
      <InlineConfirmation
        title="Remove project?"
        description="The checkout remains on disk."
        confirmLabel="Remove project"
        destructive
        onConfirm={confirm}
        onCancel={cancel}
      />,
    );

    expect(confirm).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();

    const cancelButton = page.getByRole("button", { name: "Cancel" });
    cancelButton.element().focus();
    await userEvent.keyboard("{Enter}");
    expect(cancel).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();

    const confirmButton = page.getByRole("button", { name: "Remove project" });
    confirmButton.element().focus();
    await userEvent.keyboard(" ");
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirmButton.element().className).toContain("bg-destructive");
  });
});
