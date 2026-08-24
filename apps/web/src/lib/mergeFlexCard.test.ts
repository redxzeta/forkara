import type { MergeFlexReceiptsResult } from "@forkara/contracts";
import { describe, expect, it } from "vitest";

import {
  MERGE_FLEX_CARD_HEIGHT,
  MERGE_FLEX_CARD_WIDTH,
  mergeFlexCardFilename,
  projectFactualMergeFlexCard,
  projectParodyMergeFlexCard,
} from "~/lib/mergeFlexCard";

function privateReceiptResult(incomplete = false): MergeFlexReceiptsResult {
  return {
    date: "2026-08-24",
    startedAt: "2026-08-24T07:00:00.000Z",
    endedAt: "2026-08-25T07:00:00.000Z",
    scope: { type: "repository", repository: "secret-corp/private-repo" },
    viewer: "private-user",
    count: 1,
    incomplete,
    receipts: [
      {
        number: 42,
        title: "Confidential launch plan",
        url: "https://github.com/secret-corp/private-repo/pull/42",
        repository: "secret-corp/private-repo",
        repositoryVisibility: "private",
        authorLogin: "private-user",
        mergedAt: "2026-08-24T18:00:00.000Z",
      },
    ],
  };
}

describe("Merge Flex card projection", () => {
  it("projects factual receipt data without private identity or repository details", () => {
    const model = projectFactualMergeFlexCard(privateReceiptResult());
    const serialized = JSON.stringify(model);

    expect(model).toEqual({
      source: "factual",
      count: 1,
      countLabel: "1",
      date: "2026-08-24",
      scopeLabel: "Current repository",
      headline: "YOUR PRs MERGED TODAY",
      marker: "FACTUAL RECEIPTS",
      footer: "Git has receipts.",
    });
    expect(serialized).not.toContain("secret-corp");
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain("Confidential");
    expect(serialized).not.toContain("github.com");
  });

  it("preserves factual lower-bound semantics without inventing an exact count", () => {
    expect(projectFactualMergeFlexCard(privateReceiptResult(true))).toMatchObject({
      countLabel: "1+",
      footer: "Git has at least this many receipts.",
    });
  });

  it("projects parody state with labels that survive export", () => {
    const model = projectParodyMergeFlexCard({ count: 999_999, date: "2026-08-24" });
    expect(model).toEqual({
      source: "parody",
      count: 999_999,
      countLabel: "999,999",
      date: "2026-08-24",
      scopeLabel: "Simulated locally",
      headline: "ALLEGED PRs MERGED TODAY",
      marker: "PARODY",
      footer: "Source: vibes · Audited by absolutely nobody.",
    });
    expect(() => projectParodyMergeFlexCard({ count: 1_000_000, date: "2026-08-24" })).toThrow(
      RangeError,
    );
  });

  it("locks export geometry and privacy-neutral filenames", () => {
    const model = projectFactualMergeFlexCard(privateReceiptResult());
    expect([MERGE_FLEX_CARD_WIDTH, MERGE_FLEX_CARD_HEIGHT]).toEqual([1200, 675]);
    expect(mergeFlexCardFilename(model)).toBe("forkara-merge-flex-factual-2026-08-24.png");
  });
});
