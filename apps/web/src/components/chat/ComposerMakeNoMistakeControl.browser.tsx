import "../../index.css";

import { useState } from "react";
import type { MakeNoMistakeLevel } from "@forkara/contracts";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { ComposerMakeNoMistakeControl } from "./ComposerMakeNoMistakeControl";

function StatefulControl() {
  const [level, setLevel] = useState<MakeNoMistakeLevel>(0);
  return <ComposerMakeNoMistakeControl level={level} onLevelChange={setLevel} />;
}

describe("ComposerMakeNoMistakeControl", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the active level without relying on color and cycles back to off", async () => {
    const screen = await render(<StatefulControl />);
    try {
      await page.getByRole("button", { name: /Make No Mistake is off/u }).click();
      await expect.element(page.getByText("Make No Mistake · 1")).toBeVisible();
      await page.getByRole("button", { name: /level 1 of 3/u }).click();
      await expect.element(page.getByText("Make No Mistake · 2")).toBeVisible();
      await page.getByRole("button", { name: /level 2 of 3/u }).click();
      await expect.element(page.getByText("Make No Mistake · 3")).toBeVisible();
      await page.getByRole("button", { name: /level 3 of 3/u }).click();
      await expect.element(page.getByText("Make No Mistake")).toBeVisible();
    } finally {
      await screen.unmount();
    }
  });

  it("exposes its scope and active state accessibly", async () => {
    const screen = await render(
      <ComposerMakeNoMistakeControl level={2} onLevelChange={() => undefined} />,
    );
    try {
      const control = page.getByRole("button", { name: /level 2 of 3/u });
      await expect.element(control).toHaveAttribute("aria-pressed", "true");
      await expect
        .element(control)
        .toHaveAttribute(
          "title",
          "Changes response directness and detail for this message only. It does not change the model, tools, permissions, or autonomy.",
        );
    } finally {
      await screen.unmount();
    }
  });
});
