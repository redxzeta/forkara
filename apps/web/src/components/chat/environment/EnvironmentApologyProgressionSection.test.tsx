import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { APOLOGY_PROGRESSION_STAGES } from "~/lib/apologyProgression";

import { ApologyProgressionReport } from "./EnvironmentApologyProgressionSection";

function normalizedMarkup(stageIndex: number): string {
  return renderToStaticMarkup(<ApologyProgressionReport stageIndex={stageIndex} />)
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

describe("ApologyProgressionReport", () => {
  it("renders every stage in order and marks the current step", () => {
    const markup = normalizedMarkup(2);
    const indexes = APOLOGY_PROGRESSION_STAGES.map((stage) => markup.lastIndexOf(stage.title));

    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain("Current stage");
    expect(markup).not.toContain("Satire");
    expect(markup).not.toContain("Local only");
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual(indexes.toSorted((left, right) => left - right));
  });

  it("makes the final stage about attribution without another joke disclaimer", () => {
    const markup = normalizedMarkup(APOLOGY_PROGRESSION_STAGES.length - 1);

    expect(markup).toContain("Actual Apology");
    expect(markup).toContain("acknowledge the fork");
    expect(markup).toContain("credit upstream work");
    expect(markup).not.toContain("not legal advice or proof of compliance");
    expect(markup).not.toContain("Nothing is sent to GitHub");
  });

  it("clamps malformed stage indexes at the presentation boundary", () => {
    const markup = normalizedMarkup(999);

    expect(markup).toContain("Stage 6 of 6");
    expect(markup).toContain("Actual Apology");
    expect(markup).not.toContain("Stage 1000 of 6");
  });
});
