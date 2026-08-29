// FILE: EnvironmentRow.browser.tsx
// Purpose: Browser-level regression tests for Environment panel disclosure behavior.
// Layer: Vitest browser tests

import "../../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import {
  EnvironmentCollapsibleSection,
  EnvironmentDisclosureGroup,
  EnvironmentLabeledSection,
} from "./EnvironmentRow";

describe("EnvironmentCollapsibleSection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("uses the shared panel and chevron motion while exposing expanded state", async () => {
    await render(
      <EnvironmentCollapsibleSection label="Pinned">
        <span>Section content</span>
      </EnvironmentCollapsibleSection>,
    );

    const trigger = document.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]');
    const panel = document.querySelector<HTMLElement>('[data-slot="collapsible-panel"]');
    const chevron = trigger?.querySelector<SVGElement>("svg");

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.className).toContain("duration-220");
    expect(chevron?.getAttribute("class")).toContain("duration-220");
    expect(chevron?.getAttribute("class")).toContain("rotate-90");

    await page.getByRole("button", { name: "Pinned" }).click();

    await vi.waitFor(() => expect(trigger?.getAttribute("aria-expanded")).toBe("false"));
    expect(chevron?.getAttribute("class")).not.toContain("rotate-90");
  });
});

describe("EnvironmentDisclosureGroup", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each([1_440, 1_280, 1_024])(
    "opens with keyboard access and enables its contents at %ipx",
    async (width) => {
      await page.viewport(width, 800);
      await render(
        <div className="w-72" data-testid="environment-card">
          <EnvironmentDisclosureGroup label="Fork Tools">
            {(open) => <span>{open ? "Fork Health ready" : "Expensive read disabled"}</span>}
          </EnvironmentDisclosureGroup>
        </div>,
      );

      const trigger = page.getByRole("button", { name: "Fork Tools" });
      await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
      await expect.element(page.getByText("Fork Health ready")).not.toBeInTheDocument();

      document.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]')?.focus();
      await userEvent.keyboard("{Enter}");

      await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
      await expect.element(page.getByText("Fork Health ready")).toBeInTheDocument();
      const card = document.querySelector<HTMLElement>("[data-testid='environment-card']");
      expect(card?.scrollWidth).toBeLessThanOrEqual(card?.clientWidth ?? 0);

      await userEvent.keyboard(" ");
      await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
      await expect.element(page.getByText("Fork Health ready")).not.toBeInTheDocument();
    },
  );

  it("suppresses a repeated nested group label while preserving distinct section names", async () => {
    await render(
      <EnvironmentDisclosureGroup label="Fork Lore™">
        {() => (
          <>
            <EnvironmentLabeledSection label="Fork Lore">
              <span>Originality Meter™</span>
            </EnvironmentLabeledSection>
            <EnvironmentLabeledSection label="Achievements">
              <span>Local achievements</span>
            </EnvironmentLabeledSection>
          </>
        )}
      </EnvironmentDisclosureGroup>,
    );

    await page.getByRole("button", { name: "Fork Lore™" }).click();

    await expect.element(page.getByText("Fork Lore", { exact: true })).not.toBeInTheDocument();
    await expect.element(page.getByText("Achievements", { exact: true })).toBeInTheDocument();
  });
});
