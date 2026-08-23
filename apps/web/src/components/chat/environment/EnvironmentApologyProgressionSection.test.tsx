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
  it("renders every stage in order and marks the current step as satire", () => {
    const markup = normalizedMarkup(2);
    const indexes = APOLOGY_PROGRESSION_STAGES.map((stage) => markup.lastIndexOf(stage.title));

    expect(markup).toContain("Satire");
    expect(markup).toContain("Local only");
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain("Current satirical stage");
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual(indexes.toSorted((left, right) => left - right));
  });

  it("makes the final stage about attribution without claiming compliance", () => {
    const markup = normalizedMarkup(APOLOGY_PROGRESSION_STAGES.length - 1);

    expect(markup).toContain("Actual Apology");
    expect(markup).toContain("acknowledge the fork");
    expect(markup).toContain("credit upstream work");
    expect(markup).toContain("not legal advice or proof of compliance");
    expect(markup).toContain("Nothing is sent to GitHub, social media, another person");
    expect(markup).toContain("No person is named or impersonated");
  });

  it("clamps malformed stage indexes at the presentation boundary", () => {
    const markup = normalizedMarkup(999);

    expect(markup).toContain("Stage 6 of 6");
    expect(markup).toContain("Actual Apology");
    expect(markup).not.toContain("Stage 1000 of 6");
  });
});
