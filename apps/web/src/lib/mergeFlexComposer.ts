import type { MergeFlexReceiptsResult } from "@forkara/contracts";

export const MERGE_FLEX_FACTUAL_TEMPLATE_IDS = ["receipts", "problem", "normal"] as const;

export type MergeFlexFactualTemplateId = (typeof MERGE_FLEX_FACTUAL_TEMPLATE_IDS)[number];

export interface MergeFlexFactualDraftInput {
  readonly count: number;
  readonly date: string;
  readonly incomplete: boolean;
  readonly repository: string | null;
}

export interface MergeFlexFactualTemplate {
  readonly id: MergeFlexFactualTemplateId;
  readonly label: string;
}

export interface MergeFlexPostGate {
  inFlight: boolean;
}

export type MergeFlexPostOutcome<T> =
  | { readonly status: "success"; readonly result: T }
  | { readonly status: "error"; readonly error: unknown };

export const MERGE_FLEX_FACTUAL_TEMPLATES: readonly MergeFlexFactualTemplate[] = [
  { id: "receipts", label: "Git has receipts" },
  { id: "problem", label: "Everyone's problem" },
  { id: "normal", label: "Totally normal" },
] as const;

function factualScopeSuffix(repository: string | null): string {
  return repository ? ` in ${repository}` : "";
}

export function composeMergeFlexFactualDraft(
  templateId: MergeFlexFactualTemplateId,
  input: MergeFlexFactualDraftInput,
): string {
  const scope = factualScopeSuffix(input.repository);
  const lowerBound = input.incomplete ? "At least " : "";
  const shortCount = `${lowerBound}${input.count} ${input.count === 1 ? "PR" : "PRs"}`;
  const longCount = `${lowerBound}${input.count} ${input.count === 1 ? "pull request" : "pull requests"}`;

  switch (templateId) {
    case "receipts":
      return `${shortCount} landed${scope} on ${input.date}. Git has receipts. Forkara has a button for bragging about it.`;
    case "problem":
      return `${longCount} landed${scope} on ${input.date}. I have chosen to make this everyone else's problem.`;
    case "normal":
      return `Today's totally normal developer activity: ${shortCount} merged${scope} on ${input.date}. 🍴`;
  }
}

export function countUnicodeCharacters(value: string): number {
  return Array.from(value).length;
}

export function createMergeFlexPostGate(): MergeFlexPostGate {
  return { inFlight: false };
}

/** Starts only a connected, non-empty, single in-flight submission. The caller retains the draft. */
export function startExplicitMergeFlexPost<T>(
  gate: MergeFlexPostGate,
  input: { readonly connected: boolean; readonly text: string },
  post: (text: string) => Promise<T>,
): Promise<MergeFlexPostOutcome<T>> | null {
  if (gate.inFlight || !input.connected || input.text.trim().length === 0) return null;
  gate.inFlight = true;
  return post(input.text)
    .then((result) => ({ status: "success", result }) as const)
    .catch((error: unknown) => ({ status: "error", error }) as const)
    .finally(() => {
      gate.inFlight = false;
    });
}

/**
 * Repository identity is shareable only for an explicit current-repository result whose receipts
 * all carry GitHub's public visibility classification. Aggregate count remains the default.
 */
export function factualShareableRepository(result: MergeFlexReceiptsResult): string | null {
  if (result.scope.type !== "repository" || result.receipts.length === 0) return null;
  const repository = result.scope.repository;
  return result.receipts.every(
    (receipt) => receipt.repository === repository && receipt.repositoryVisibility === "public",
  )
    ? repository
    : null;
}

export function mergeFlexScopeLabel(result: MergeFlexReceiptsResult): string {
  return result.scope.type === "all" ? "All visible repositories" : "Current repository";
}

export function mergeFlexErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }
  return fallback;
}
