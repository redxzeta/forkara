import type { GitOriginalityMeterResult } from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OriginalityMeterReport } from "./EnvironmentOriginalityMeterSection";

function result(overrides: Partial<GitOriginalityMeterResult> = {}): GitOriginalityMeterResult {
  return {
    state: "ready",
    message: "Parody score calculated from exact fork changes.",
    scorePercent: 25,
    changedFileCount: 1,
    comparableFileCount: 4,
    insertions: 12,
    deletions: 3,
    binaryFileCount: 1,
    excludedFileCount: 2,
    forkUniqueCommitCount: 5,
    upstreamUniqueCommitCount: 9,
    calculationVersion: "changed_eligible_files_v1",
    exclusionRules: ["Files Git reports as binary in the fork-only diff"],
    ...overrides,
  };
}

describe("OriginalityMeterReport", () => {
  it("shows the score, deterministic method, legal boundary, and factual counts", () => {
    const html = renderToStaticMarkup(<OriginalityMeterReport result={result()} />);

    expect(html).toContain("Originality: 25% ✨");
    expect(html).toContain("Inspired By");
    expect(html).toContain(
      'aria-label="Certification badge: Inspired By. Originality score 25 percent."',
    );
    expect(html).toContain("Not a legal determination of originality");
    expect(html).not.toContain("This score is a joke");
    expect(html).toContain("1 of 4");
    expect(html).toContain('aria-label="12 insertions, 3 deletions"');
    expect(html).toContain("Fork-only commits");
    expect(html).toContain("between the exact Git merge-base and committed HEAD");
    expect(html).toContain("Files Git reports as binary");
  });

  it("keeps unavailable provenance distinct from a zero-percent score", () => {
    const html = renderToStaticMarkup(
      <OriginalityMeterReport
        result={result({
          state: "missing_upstream",
          message: "Configure and refresh an upstream remote.",
          scorePercent: null,
          changedFileCount: 0,
          comparableFileCount: 0,
        })}
      />,
    );

    expect(html).toContain("Upstream required");
    expect(html).not.toContain("Originality: 0%");
    expect(html).not.toContain("Factual receipts");
    expect(html).toContain("Configure and refresh an upstream remote.");
    expect(html).not.toContain("Certification badge:");
  });

  it("renders the Built From Scratch badge with its upstream-history disclaimer", () => {
    const html = renderToStaticMarkup(
      <OriginalityMeterReport result={result({ scorePercent: 100, changedFileCount: 4 })} />,
    );

    expect(html).toContain("Built From Scratch™*");
    expect(html).toContain("* upstream history may apply");
    expect(html).toContain("Upstream history may apply");
  });
});
