import type { GitAttributionGuardianResult } from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttributionGuardianReport } from "./EnvironmentAttributionGuardianSection";

function report(
  overrides: Partial<GitAttributionGuardianResult> = {},
): GitAttributionGuardianResult {
  return {
    state: "ready",
    message: "1 attribution file change needs review. This is informational, not legal advice.",
    localRef: "HEAD",
    upstreamRef: "refs/remotes/upstream/main",
    warningCount: 1,
    files: [
      {
        path: "LICENSE",
        change: "modified",
        warning: true,
        summary: "Text differs from cached upstream.",
        diff: "-upstream text\n+fork text\n",
        diffTruncated: false,
      },
    ],
    ...overrides,
  };
}

describe("AttributionGuardianReport", () => {
  it("renders the exact location, patch, warning, and legal-advice disclaimer", () => {
    const html = renderToStaticMarkup(<AttributionGuardianReport report={report()} />);

    expect(html).toContain("1 change to review");
    expect(html).toContain("LICENSE");
    expect(html).toContain("Modified in fork");
    expect(html).toContain("-upstream text");
    expect(html).toContain("+fork text");
    expect(html).toContain("does not provide legal advice");
  });

  it("distinguishes an empty comparison from unavailable upstream", () => {
    const empty = renderToStaticMarkup(
      <AttributionGuardianReport
        report={report({
          message: "No recognized attribution files exist in either ref.",
          warningCount: 0,
          files: [],
        })}
      />,
    );
    const unavailable = renderToStaticMarkup(
      <AttributionGuardianReport
        report={report({
          state: "missing_upstream",
          message: "Configure an upstream remote before comparing attribution files.",
          upstreamRef: null,
          warningCount: 0,
          files: [],
        })}
      />,
    );

    expect(empty).toContain("No recognized attribution files");
    expect(unavailable).toContain("Upstream unavailable");
    expect(unavailable).not.toContain("No recognized attribution files.</p>");
  });

  it("discloses bounded patch truncation", () => {
    const html = renderToStaticMarkup(
      <AttributionGuardianReport
        report={report({
          files: [
            {
              ...report().files[0]!,
              diffTruncated: true,
            },
          ],
        })}
      />,
    );

    expect(html).toContain("Patch preview truncated");
  });
});
