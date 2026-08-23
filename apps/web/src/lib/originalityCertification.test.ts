import type { GitOriginalityMeterResult } from "@forkara/contracts";
import { describe, expect, it } from "vitest";

import { originalityCertification } from "./originalityCertification";

function input(scorePercent: number | null, state: GitOriginalityMeterResult["state"] = "ready") {
  return { state, scorePercent };
}

describe("originalityCertification", () => {
  it.each([
    [0, "fork"],
    [1, "inspired_by"],
    [49, "inspired_by"],
    [50, "independent_continuation"],
    [99, "independent_continuation"],
    [100, "built_from_scratch"],
  ] as const)("maps the %i percent boundary to %s", (score, kind) => {
    expect(originalityCertification(input(score))).toMatchObject({ kind });
  });

  it("retains the upstream-history disclaimer at the Built From Scratch boundary", () => {
    expect(originalityCertification(input(100))).toMatchObject({
      label: "Built From Scratch™*",
      accessibleText: expect.stringContaining("Upstream history may apply"),
      disclaimer: "* upstream history may apply",
    });
  });

  it.each([
    input(null),
    input(null, "missing_upstream"),
    input(null, "incomplete_history"),
    input(null, "unrelated_history"),
    input(-1),
    input(101),
  ])("does not certify unavailable or out-of-contract results", (result) => {
    expect(originalityCertification(result)).toBeNull();
  });
});
