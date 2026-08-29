// FILE: InlineBranchCreator.browser.tsx
// Purpose: Browser coverage for popup-free branch creation in focus mode.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useState } from "react";

import { InlineBranchCreator } from "./InlineBranchCreator";

describe("InlineBranchCreator", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates a branch with normal keyboard input and no popup surface", async () => {
    const submit = vi.fn();
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <InlineBranchCreator
          open
          fieldId="branch-name"
          description="Create from main."
          value={value}
          conflict={false}
          submitLabel="Create and switch"
          onChange={setValue}
          onCancel={vi.fn()}
          onSubmit={submit}
        />
      );
    }
    await render(<Harness />);

    expect(document.querySelector('[role="dialog"], [data-slot="dialog-backdrop"]')).toBeNull();
    await page.getByLabelText("Branch name").fill("feature/focus-loop");
    await userEvent.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledWith("feature/focus-loop");
  });
});
