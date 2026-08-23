import type { GitForkHealthResult } from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ForkHealthSummary } from "./EnvironmentForkHealthSection";

function health(overrides: Partial<GitForkHealthResult> = {}): GitForkHealthResult {
  return {
    state: "healthy",
    label: "Healthy",
    summary: "The fork has no known sync or working-tree problems.",
    reasons: [
      "The fork is 2 commits ahead and not behind upstream.",
      "The working tree is clean.",
      "Attribution has not been evaluated because Attribution Guardian is not available yet.",
    ],
    hasWorkingTreeChanges: false,
    unresolvedConflictFiles: [],
    attribution: {
      state: "unknown",
      message:
        "Attribution has not been evaluated because Attribution Guardian is not available yet.",
    },
    upstream: {
      state: "ready",
      hasUpstream: true,
      localBranch: "built-from-scratch",
      upstreamBranch: "main",
      aheadCount: 2,
      behindCount: 0,
      lastSuccessfulFetchAt: new Date().toISOString(),
      checkedAt: new Date().toISOString(),
      message: "Fork is 2 commits ahead of upstream.",
    },
    ...overrides,
  };
}

describe("ForkHealthSummary", () => {
  it("renders named health, explanations, divergence, fetch recency, and unknown attribution", () => {
    const html = renderToStaticMarkup(<ForkHealthSummary health={health()} />);

    expect(html).toContain("Healthy");
    expect(html).toContain("no known sync or working-tree problems");
    expect(html).toContain("The working tree is clean.");
    expect(html).toContain("Attribution has not been evaluated");
    expect(html).toContain("Last successful fetch: Now");
    expect(html).toContain('aria-label="2 ahead, 0 behind"');
    expect(html).not.toContain("score");
  });

  it("renders unknown fetch data as unknown", () => {
    const html = renderToStaticMarkup(
      <ForkHealthSummary
        health={health({
          state: "unknown",
          label: "Unknown",
          summary: "Cached upstream information is not fresh enough to assign a health state.",
          upstream: {
            ...health().upstream,
            state: "stale",
            lastSuccessfulFetchAt: null,
          },
        })}
      />,
    );

    expect(html).toContain("Unknown");
    expect(html).toContain("Last successful fetch: Unknown");
    expect(html).not.toContain("failed");
  });
});
