import type { MergeFlexReceiptsResult } from "@forkara/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MergeFlexReceiptsContent } from "./MergeFlexReceiptsCard";

function result(receipts: MergeFlexReceiptsResult["receipts"]): MergeFlexReceiptsResult {
  return {
    date: "2026-08-23",
    startedAt: "2026-08-23T07:00:00.000Z",
    endedAt: "2026-08-24T07:00:00.000Z",
    scope: { type: "all" },
    viewer: "octocat",
    count: receipts.length,
    receipts,
    incomplete: false,
  };
}

describe("MergeFlexReceiptsContent", () => {
  it("renders a factual count and matching inspectable receipt", () => {
    const markup = renderToStaticMarkup(
      <MergeFlexReceiptsContent
        result={result([
          {
            number: 42,
            title: "Ship evidence-backed receipts",
            url: "https://github.com/acme/widgets/pull/42",
            repository: "acme/widgets",
            repositoryVisibility: "public",
            authorLogin: "octocat",
            mergedAt: "2026-08-23T18:00:00.000Z",
          },
        ])}
        receiptsOpen
        onReceiptsOpenChange={vi.fn()}
      />,
    );

    expect(markup).toContain("1");
    expect(markup).toContain("pull request");
    expect(markup).toContain("Ship evidence-backed receipts");
    expect(markup).toContain("acme/widgets#42");
    expect(markup).toContain("Authored by @octocat");
  });

  it("labels non-public repository details in the local drill-down", () => {
    const markup = renderToStaticMarkup(
      <MergeFlexReceiptsContent
        result={result([
          {
            number: 7,
            title: "Private work",
            url: "https://github.com/acme/private/pull/7",
            repository: "acme/private",
            repositoryVisibility: "unknown",
            authorLogin: "octocat",
            mergedAt: "2026-08-23T19:00:00.000Z",
          },
        ])}
        receiptsOpen
        onReceiptsOpenChange={vi.fn()}
      />,
    );

    expect(markup).toContain("Visibility unknown");
  });

  it("shows a verified empty state only for a successful zero result", () => {
    const markup = renderToStaticMarkup(
      <MergeFlexReceiptsContent
        result={result([])}
        receiptsOpen={false}
        onReceiptsOpenChange={vi.fn()}
      />,
    );

    expect(markup).toContain("No pull requests authored by @octocat were merged");
    expect(markup).not.toContain("Receipts</button>");
  });

  it("offers an explicit factual X composer action only when there are receipts", () => {
    const factualResult = result([
      {
        number: 42,
        title: "Ship evidence-backed receipts",
        url: "https://github.com/acme/widgets/pull/42",
        repository: "acme/widgets",
        repositoryVisibility: "public",
        authorLogin: "octocat",
        mergedAt: "2026-08-23T18:00:00.000Z",
      },
    ]);
    const markup = renderToStaticMarkup(
      <MergeFlexReceiptsContent
        result={factualResult}
        receiptsOpen={false}
        onReceiptsOpenChange={vi.fn()}
        onFlexOnX={vi.fn()}
      />,
    );

    expect(markup).toContain("Flex on X");
    expect(markup).toContain("Authored by @octocat");
  });
});
