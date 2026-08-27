// FILE: NoForksGivenModeSetting.browser.tsx
// Purpose: Verifies immediate focus-mode preference interaction and safeguard copy.

import "../../index.css";

import { useState } from "react";
import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { NoForksGivenModeSetting } from "./NoForksGivenModeSetting";

function Harness() {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <output aria-label="Current value">{String(checked)}</output>
      <NoForksGivenModeSetting
        checked={checked}
        defaultChecked={false}
        onCheckedChange={setChecked}
      />
    </>
  );
}

describe("NoForksGivenModeSetting", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("applies the local preference immediately and resets to its default", async () => {
    await render(<Harness />);
    const toggle = page.getByRole("switch", { name: "Enable No Forks Given Mode" });

    await expect.element(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect.element(toggle).toBeChecked();
    await expect.element(page.getByLabelText("Current value")).toHaveTextContent("true");

    await userEvent.click(page.getByRole("button", { name: "Reset No Forks Given Mode" }));
    await expect.element(toggle).not.toBeChecked();
    await expect.element(page.getByLabelText("Current value")).toHaveTextContent("false");
  });

  it("states that focus mode leaves safeguards and confirmations intact", async () => {
    await render(<Harness />);
    expect(document.body.textContent).toContain(
      "Safeguards, permissions, and explicit confirmation requirements remain unchanged.",
    );
  });
});
