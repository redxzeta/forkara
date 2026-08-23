import type {
  GitForkArchaeologyCommit,
  GitForkArchaeologyOverviewResult,
} from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ForkArchaeologyFileHistory,
  ForkArchaeologyOverviewCard,
} from "./EnvironmentForkArchaeologySection";

const sharedCommit: GitForkArchaeologyCommit = {
  sha: "1111111111111111111111111111111111111111",
  shortSha: "1111111",
  subject: "Shared foundation",
  authorName: "Ada",
  authoredAt: "2026-08-23T12:00:00.000Z",
  origin: "shared",
  upstreamUrl: "https://github.com/upstream/project/commit/1111111",
};

function overview(
  overrides: Partial<GitForkArchaeologyOverviewResult> = {},
): GitForkArchaeologyOverviewResult {
  return {
    state: "ready",
    message: "Git found a common ancestor and can establish exact commit provenance.",
    localRef: "HEAD",
    upstreamRef: "refs/remotes/upstream/main",
    mergeBase: sharedCommit,
    forkUniqueCount: 12,
    upstreamUniqueCount: 4,
    upstreamRepositoryUrl: "https://github.com/upstream/project",
    ...overrides,
  };
}

describe("ForkArchaeologyOverviewCard", () => {
  it("shows merge-base and factual unique commit counts without a score", () => {
    const markup = renderToStaticMarkup(<ForkArchaeologyOverviewCard overview={overview()} />);

    expect(markup).toContain("Exact common ancestry");
    expect(markup).toContain("12 fork-only, 4 upstream-only commits");
    expect(markup).toContain("1111111");
    expect(markup).toContain("HEAD ↔ refs/remotes/upstream/main");
    expect(markup.toLowerCase()).not.toContain("score");
  });

  it("labels shallow and unrelated history as unknown instead of inventing ancestry", () => {
    const shallow = renderToStaticMarkup(
      <ForkArchaeologyOverviewCard
        overview={overview({
          state: "incomplete_history",
          message: "This shallow clone does not contain enough history.",
          mergeBase: null,
        })}
      />,
    );
    const unrelated = renderToStaticMarkup(
      <ForkArchaeologyOverviewCard
        overview={overview({
          state: "unrelated_history",
          message: "The histories may be unrelated or rewritten.",
          mergeBase: null,
        })}
      />,
    );

    expect(shallow).toContain("History incomplete");
    expect(shallow).toContain("Merge-base: </span><span>Unknown");
    expect(unrelated).toContain("No common ancestor");
    expect(unrelated).toContain("unrelated or rewritten");
  });
});

describe("ForkArchaeologyFileHistory", () => {
  it("shows exact selected-file provenance and unknown empty history distinctly", () => {
    const available = renderToStaticMarkup(
      <ForkArchaeologyFileHistory
        history={{
          state: "available",
          message: "History is reported from exact commit ancestry recorded by Git.",
          path: "src/file.ts",
          commits: [
            sharedCommit,
            { ...sharedCommit, sha: "222", shortSha: "2222222", origin: "fork", upstreamUrl: null },
          ],
          nextOffset: null,
        }}
      />,
    );
    const unknown = renderToStaticMarkup(
      <ForkArchaeologyFileHistory
        history={{
          state: "unknown",
          message: "Git has no recorded history for this path.",
          path: "missing.ts",
          commits: [],
          nextOffset: null,
        }}
      />,
    );

    expect(available).toContain("src/file.ts");
    expect(available).toContain("Shared with upstream");
    expect(available).toContain("Fork-only");
    expect(unknown).toContain("Origin unknown");
    expect(unknown).not.toContain("Fork-only");
  });
});
