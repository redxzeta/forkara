import type { GitUpstreamStatusResult } from "@forkara/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { gitQueryKeys } from "~/lib/gitReactQuery";

import { EnvironmentUpstreamRadarSection } from "./EnvironmentUpstreamRadarSection";

const cwd = "/repo";

function renderStatus(status: GitUpstreamStatusResult): string {
  const queryClient = new QueryClient();
  queryClient.setQueryData(gitQueryKeys.upstreamStatus(cwd), status);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <EnvironmentUpstreamRadarSection gitCwd={cwd} enabled />
    </QueryClientProvider>,
  );
}

describe("EnvironmentUpstreamRadarSection", () => {
  it("renders factual divergence, branch mapping, fetch time, and refresh action", () => {
    const html = renderStatus({
      state: "ready",
      hasUpstream: true,
      localBranch: "built-from-scratch",
      upstreamBranch: "main",
      aheadCount: 2,
      behindCount: 3,
      lastSuccessfulFetchAt: new Date().toISOString(),
      checkedAt: new Date().toISOString(),
      message: "Fork has diverged: 2 ahead and 3 behind upstream.",
    });

    expect(html).toContain("Upstream Radar");
    expect(html).toContain("Fork has diverged: 2 ahead and 3 behind upstream.");
    expect(html).toContain("built-from-scratch → upstream/main");
    expect(html).toContain('aria-label="2 ahead, 3 behind"');
    expect(html).toContain("Fetched now");
    expect(html).toContain("Preview sync");
    expect(html).toContain("Refresh upstream");
  });

  it("renders a useful empty state without offering an impossible fetch", () => {
    const html = renderStatus({
      state: "missing",
      hasUpstream: false,
      localBranch: null,
      upstreamBranch: null,
      aheadCount: 0,
      behindCount: 0,
      lastSuccessfulFetchAt: null,
      checkedAt: new Date().toISOString(),
      message: "No upstream remote is configured for this repository.",
    });

    expect(html).toContain("No upstream remote is configured for this repository.");
    expect(html).not.toContain("Refresh upstream");
    expect(html).not.toContain("Preview sync");
  });
});
