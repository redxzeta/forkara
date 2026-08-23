// FILE: originalityCertification.ts
// Purpose: Single deterministic mapping from Originality Meter receipts to parody badges.
// Layer: Web presentation logic; performs no repository analysis.

import type { GitOriginalityMeterResult } from "@forkara/contracts";

export type OriginalityCertificationKind =
  | "fork"
  | "inspired_by"
  | "independent_continuation"
  | "built_from_scratch";

export interface OriginalityCertification {
  readonly kind: OriginalityCertificationKind;
  readonly label: string;
  readonly accessibleText: string;
  readonly description: string;
  readonly disclaimer: string | null;
  readonly variant: "outline" | "info" | "success" | "warning";
}

export function originalityCertification(
  result: Pick<GitOriginalityMeterResult, "state" | "scorePercent">,
): OriginalityCertification | null {
  const score = result.scorePercent;
  if (result.state !== "ready" || score === null || score < 0 || score > 100) return null;

  if (score === 0) {
    return {
      kind: "fork",
      label: "Fork",
      accessibleText: "Certification badge: Fork. Originality score 0 percent.",
      description: "No eligible committed files differ from the exact common ancestor.",
      disclaimer: null,
      variant: "outline",
    };
  }
  if (score < 50) {
    return {
      kind: "inspired_by",
      label: "Inspired By",
      accessibleText: `Certification badge: Inspired By. Originality score ${score} percent.`,
      description: "Some eligible committed files differ from the exact common ancestor.",
      disclaimer: null,
      variant: "info",
    };
  }
  if (score < 100) {
    return {
      kind: "independent_continuation",
      label: "Independent Continuation",
      accessibleText: `Certification badge: Independent Continuation. Originality score ${score} percent.`,
      description:
        "At least half of eligible committed files differ from the exact common ancestor.",
      disclaimer: null,
      variant: "success",
    };
  }
  return {
    kind: "built_from_scratch",
    label: "Built From Scratch™*",
    accessibleText:
      "Certification badge: Built From Scratch. Originality score 100 percent. Upstream history may apply.",
    description: "Every eligible committed file differs from the exact common ancestor.",
    disclaimer: "* upstream history may apply",
    variant: "warning",
  };
}
