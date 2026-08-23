import type { GitForkFamilyTreeResult } from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ForkFamilyTreeReport } from "./EnvironmentForkFamilyTreeSection";

function tree(overrides: Partial<GitForkFamilyTreeResult> = {}): GitForkFamilyTreeResult {
  return {
    metadataState: "complete",
    message: "Ancestry detected. This does not necessarily mean you're related. (It does.)",
    nodes: [
      {
        id: "current",
        role: "current",
        name: "fork/project",
        repositoryUrl: "https://github.com/fork/project",
        remoteName: "origin",
        defaultBranch: "built-from-scratch",
        aheadCount: 4,
        behindCount: 2,
        lastActivityAt: new Date().toISOString(),
      },
      {
        id: "upstream",
        role: "upstream",
        name: "source/project",
        repositoryUrl: null,
        remoteName: "upstream",
        defaultBranch: "main",
        aheadCount: 2,
        behindCount: 4,
        lastActivityAt: null,
      },
    ],
    edges: [{ from: "upstream", to: "current", relationship: "configured_upstream" }],
    ...overrides,
  };
}

describe("ForkFamilyTreeReport", () => {
  it("renders direct ancestry, activity, divergence, and a focusable semantic representation", () => {
    const html = renderToStaticMarkup(<ForkFamilyTreeReport tree={tree()} />);

    expect(html).toContain("Configured upstream");
    expect(html).toContain("source/project");
    expect(html).toContain("Current repository");
    expect(html).toContain("fork/project");
    expect(html).toContain('aria-label="2 ahead, 4 behind"');
    expect(html).toContain('aria-label="Direct repository ancestry"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("does not crawl");
  });

  it("labels partial and local-only metadata honestly", () => {
    const partial = renderToStaticMarkup(
      <ForkFamilyTreeReport
        tree={tree({ metadataState: "partial", message: "Local remotes only." })}
      />,
    );
    const local = renderToStaticMarkup(
      <ForkFamilyTreeReport
        tree={tree({
          metadataState: "local_only",
          message: "No direct ancestry is known locally.",
          nodes: [tree().nodes[0]!],
          edges: [],
        })}
      />,
    );

    expect(partial).toContain("Partial metadata");
    expect(local).toContain("Local-only mode");
    expect(local).not.toContain("source/project");
  });
});
