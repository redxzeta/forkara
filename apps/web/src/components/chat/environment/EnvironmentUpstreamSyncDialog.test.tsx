import type { GitUpstreamSyncPreviewResult } from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UpstreamSyncPreviewContent } from "./EnvironmentUpstreamSyncDialog";

function preview(
  overrides: Partial<GitUpstreamSyncPreviewResult> = {},
): GitUpstreamSyncPreviewResult {
  return {
    state: "fast_forward",
    canApply: true,
    localBranch: "built-from-scratch",
    upstreamBranch: "main",
    localHead: "1111111111111111111111111111111111111111",
    upstreamHead: "2222222222222222222222222222222222222222",
    aheadCount: 0,
    behindCount: 1,
    incomingCommits: [
      {
        sha: "2222222222222222222222222222222222222222",
        shortSha: "2222222",
        subject: "Add upstream change",
        authorName: "Upstream Author",
        authoredAt: "2026-08-23T12:00:00.000Z",
      },
    ],
    incomingCommitsTruncated: false,
    conflictFiles: [],
    preferredStrategy: "fast-forward-only",
    message: "Ready to fast-forward by 1 commit. This updates only the local branch.",
    ...overrides,
  };
}

describe("UpstreamSyncPreviewContent", () => {
  it("shows factual branch, divergence, commit, and local-only safety information", () => {
    const html = renderToStaticMarkup(<UpstreamSyncPreviewContent preview={preview()} />);

    expect(html).toContain("Fast-forward available");
    expect(html).toContain("built-from-scratch ← upstream/main");
    expect(html).toContain("Add upstream change");
    expect(html).toContain("Upstream Author");
    expect(html).toContain("never pushes or force-pushes");
  });

  it("shows prospective conflict files and guidance", () => {
    const html = renderToStaticMarkup(
      <UpstreamSyncPreviewContent
        preview={preview({
          state: "conflicts",
          canApply: false,
          aheadCount: 1,
          conflictFiles: ["README.md"],
          preferredStrategy: "rebase",
          message: "Upstream changes conflict with this fork.",
        })}
      />,
    );

    expect(html).toContain("Conflicts detected");
    expect(html).toContain("Conflicting files");
    expect(html).toContain("README.md");
  });
});
