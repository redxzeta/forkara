import type { GitForkSpeedrunResult } from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ForkSpeedrunReport, formatSpeedrunElapsed } from "./EnvironmentForkSpeedrunSection";

function result(overrides: Partial<GitForkSpeedrunResult> = {}): GitForkSpeedrunResult {
  return {
    state: "ready",
    message: "Local milestones from exact Git history.",
    startedAt: "2026-08-23T12:00:00.000Z",
    events: [
      {
        kind: "project_added",
        label: "Project added to Forkara",
        occurredAt: "2026-08-23T12:00:00.000Z",
        elapsedSeconds: 0,
        commit: null,
      },
      {
        kind: "readme_changed",
        label: "README changed",
        occurredAt: "2026-08-23T12:08:41.000Z",
        elapsedSeconds: 521,
        commit: {
          sha: "a".repeat(40),
          shortSha: "aaaaaaa",
          subject: "Rewrite README",
        },
      },
    ],
    missingEvents: ["first_fork_commit"],
    ...overrides,
  };
}

describe("ForkSpeedrunReport", () => {
  it("renders factual elapsed receipts and leaves missing events untimed", () => {
    const html = renderToStaticMarkup(<ForkSpeedrunReport result={result()} />);

    expect(html).toContain("Project added to Forkara");
    expect(html).toContain("README changed");
    expect(html).toContain("08:41");
    expect(html).toContain('aria-label="README changed, 521 seconds after project added"');
    expect(html).toContain("First fork-only commit — no timestamp");
    expect(html).toContain("Official timing desk");
    expect(html).toContain("does not yet retain trustworthy receipts");
    expect(html).not.toContain("No telemetry");
  });

  it("formats minute and hour timelines without fake precision", () => {
    expect(formatSpeedrunElapsed(0)).toBe("00:00");
    expect(formatSpeedrunElapsed(521)).toBe("08:41");
    expect(formatSpeedrunElapsed(4_121)).toBe("1:08:41");
  });
});
