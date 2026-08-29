import type { MergeFlexReceiptsResult } from "@forkara/contracts";

import { MERGE_FLEX_PARODY_COUNT_MAX, mergeFlexScopeLabel } from "~/lib/mergeFlexComposer";

export const MERGE_FLEX_CARD_WIDTH = 1200;
export const MERGE_FLEX_CARD_HEIGHT = 675;

export type MergeFlexCardSource = "factual" | "parody";

/** Privacy-safe display data. Receipt records and account identity never cross this boundary. */
export interface MergeFlexCardModel {
  readonly source: MergeFlexCardSource;
  readonly count: number;
  readonly countLabel: string;
  readonly date: string;
  readonly scopeLabel: string;
  readonly headline: string;
  readonly marker: "FACTUAL RECEIPTS" | "PARODY";
  readonly footer: string;
}

export function projectFactualMergeFlexCard(result: MergeFlexReceiptsResult): MergeFlexCardModel {
  return {
    source: "factual",
    count: result.count,
    countLabel: result.incomplete
      ? `${formatMergeFlexCardCount(result.count)}+`
      : formatMergeFlexCardCount(result.count),
    date: result.date,
    scopeLabel: mergeFlexScopeLabel(result),
    headline: "YOUR PRs MERGED TODAY",
    marker: "FACTUAL RECEIPTS",
    footer: result.incomplete ? "Git has at least this many receipts." : "Git has receipts.",
  };
}

export function projectParodyMergeFlexCard(input: {
  readonly count: number;
  readonly date: string;
}): MergeFlexCardModel {
  if (
    !Number.isSafeInteger(input.count) ||
    input.count < 0 ||
    input.count > MERGE_FLEX_PARODY_COUNT_MAX
  ) {
    throw new RangeError(
      `Parody card count must be an integer from 0 to ${MERGE_FLEX_PARODY_COUNT_MAX}.`,
    );
  }
  return {
    source: "parody",
    count: input.count,
    countLabel: formatMergeFlexCardCount(input.count),
    date: input.date,
    scopeLabel: "PR Inflation Department",
    headline: "ALLEGED PRs MERGED TODAY",
    marker: "PARODY",
    footer: "Source: vibes · Audited by absolutely nobody.",
  };
}

export function mergeFlexCardFilename(model: MergeFlexCardModel): string {
  return `forkara-merge-flex-${model.source}-${model.date}.png`;
}

function formatMergeFlexCardCount(count: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(count);
}
