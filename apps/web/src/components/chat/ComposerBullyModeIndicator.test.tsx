// FILE: ComposerBullyModeIndicator.test.tsx
// Purpose: Guards server-rendered Bully Mode indicator visibility and accessibility state.
// Layer: Component rendering test

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ComposerBullyModeIndicator } from "./ComposerBullyModeIndicator";

describe("ComposerBullyModeIndicator", () => {
  it("renders nothing while the shared setting is disabled", () => {
    expect(
      renderToStaticMarkup(
        <ComposerBullyModeIndicator enabled={false} onEnabledChange={() => undefined} />,
      ),
    ).toBe("");
  });

  it("renders a text and accessibility state while enabled", () => {
    const markup = renderToStaticMarkup(
      <ComposerBullyModeIndicator enabled={true} onEnabledChange={() => undefined} />,
    );

    expect(markup).toContain("Bully Mode");
    expect(markup).toContain('aria-label="Disable Bully Mode"');
    expect(markup).toContain('aria-pressed="true"');
  });
});
