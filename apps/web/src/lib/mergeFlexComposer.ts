import type { MergeFlexReceipt, MergeFlexReceiptsResult } from "@forkara/contracts";

export const MERGE_FLEX_FACTUAL_TEMPLATE_IDS = ["receipts", "problem", "normal"] as const;

export type MergeFlexFactualTemplateId = (typeof MERGE_FLEX_FACTUAL_TEMPLATE_IDS)[number];

export const MERGE_FLEX_PARODY_TEMPLATE_IDS = [
  "accounting",
  "adjusted",
  "audited",
  "resume",
] as const;

export type MergeFlexParodyTemplateId = (typeof MERGE_FLEX_PARODY_TEMPLATE_IDS)[number];

export const MERGE_FLEX_PARODY_COUNT_MAX = 999_999;
export const MERGE_FLEX_PARODY_MARKER = "PARODY — source: vibes";

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

export interface MergeFlexParodyTemplate {
  readonly id: MergeFlexParodyTemplateId;
  readonly label: string;
}

export interface MergeFlexParodyPreset {
  readonly id: "seven" | "forty-two" | "sixty-nine" | "hundred" | "enterprise";
  readonly label: string;
  readonly count: number;
}

export interface MockMergeReceiptsInput {
  readonly count: number;
  readonly date: string;
  readonly seed?: number;
  readonly visibilityMix?: readonly MergeFlexReceipt["repositoryVisibility"][];
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

export const MERGE_FLEX_PARODY_TEMPLATES: readonly MergeFlexParodyTemplate[] = [
  { id: "accounting", label: "Accounting Department" },
  { id: "adjusted", label: "Emotionally adjusted" },
  { id: "audited", label: "No auditors" },
  { id: "resume", label: "Resume-driven" },
] as const;

export const MERGE_FLEX_PARODY_PRESETS: readonly MergeFlexParodyPreset[] = [
  { id: "seven", label: "7", count: 7 },
  { id: "forty-two", label: "42", count: 42 },
  { id: "sixty-nine", label: "69", count: 69 },
  { id: "hundred", label: "100", count: 100 },
  { id: "enterprise", label: "Enterprise velocity", count: MERGE_FLEX_PARODY_COUNT_MAX },
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

export function composeMergeFlexParodyDraft(
  templateId: MergeFlexParodyTemplateId,
  input: { readonly count: number; readonly date: string },
): string {
  const shortCount = `${input.count} ${input.count === 1 ? "PR" : "PRs"}`;
  switch (templateId) {
    case "accounting":
      return `Merged ${shortCount} on ${input.date}, allegedly. Source: Forkara Accounting Department.`;
    case "adjusted":
      return `${shortCount} merged on ${input.date}.*\n\n*numbers may have been emotionally adjusted`;
    case "audited":
      return `Daily velocity: ${shortCount} on ${input.date}. Audited by absolutely nobody.`;
    case "resume":
      return `Resume-Driven Development is going great: ${input.count} alleged ${input.count === 1 ? "merge" : "merges"} on ${input.date}.`;
  }
}

/** The final parody payload always ends in a marker the editable draft cannot remove. */
export function finalizeMergeFlexParodyPost(draft: string): string {
  const separator = draft.endsWith("\n") ? "\n" : "\n\n";
  return `${draft}${separator}${MERGE_FLEX_PARODY_MARKER}`;
}

export function hasMergeFlexParodyMarker(value: string): boolean {
  return value.endsWith(MERGE_FLEX_PARODY_MARKER);
}

export function parseMergeFlexParodyCount(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 && count <= MERGE_FLEX_PARODY_COUNT_MAX
    ? count
    : null;
}

export function makeMergeFlexMockAgentPrompt(input: {
  readonly count: number;
  readonly date: string;
}): string {
  assertMergeFlexParodyCount(input.count);
  return `You are generating local parody/demo data for Forkara's Resume-Driven Development / PR Inflation Simulator.

Create exactly ${input.count} mock pull-request receipt records for ${input.date} using the repository's existing Merge Flex mock/test fixture shape.

Requirements:
- These are simulated UI/test records only. Do not create real GitHub pull requests.
- Do not run \`gh pr create\`, \`gh api\` mutations, \`git push\`, or any GitHub write operation.
- Do not create commits or branches solely for this task.
- Do not modify the user's real Git history, contribution graph, remote repository, or open/merged PR state.
- Use deterministic seeded mock data when the fixture infrastructure supports it.
- Give each mock record a plausible but clearly synthetic title, repository label, PR number, merged timestamp on ${input.date}, and privacy/visibility fixture value required by the current type.
- Keep all output inside the existing test/dev fixture or demo-data location selected by the implementation.
- Reuse existing types/helpers; do not introduce a second PR model just for parody mode.
- Run only the smallest focused tests for the mock receipt generator if tests are available.

Before editing, inspect the current Merge Flex receipt types and mock-data conventions. When finished, report which local fixture files changed and confirm that no GitHub or Git write operation was performed.`;
}

function assertMergeFlexParodyCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > MERGE_FLEX_PARODY_COUNT_MAX) {
    throw new RangeError(
      `Mock receipt count must be an integer from 0 to ${MERGE_FLEX_PARODY_COUNT_MAX}.`,
    );
  }
}

function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Pure, in-memory demo data. URLs use the reserved `.invalid` domain and cannot reach GitHub. */
export function makeMockMergeReceipts(input: MockMergeReceiptsInput): readonly MergeFlexReceipt[] {
  assertMergeFlexParodyCount(input.count);
  const startMs = Date.parse(`${input.date}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || new Date(startMs).toISOString().slice(0, 10) !== input.date) {
    throw new RangeError("Mock receipt date must use YYYY-MM-DD.");
  }
  const visibilityMix = input.visibilityMix ?? ["public", "private", "internal", "unknown"];
  if (visibilityMix.length === 0) throw new RangeError("Visibility mix cannot be empty.");

  const random = makeSeededRandom(input.seed ?? 0x464f524b);
  const titleVerbs = ["Calibrate", "Reconcile", "Polish", "Ship", "Untangle"] as const;
  return Array.from({ length: input.count }, (_, index) => {
    const number = 1_000 + index;
    const title = titleVerbs[Math.floor(random() * titleVerbs.length)] ?? "Ship";
    const secondOfDay = Math.floor(random() * 86_400);
    return {
      number,
      title: `[Mock] ${title} parody receipt ${index + 1}`,
      url: `https://forkara-parody.invalid/demo/pull/${number}`,
      repository: `demo/parody-fixture-${1 + Math.floor(random() * 4)}`,
      repositoryVisibility: visibilityMix[index % visibilityMix.length] ?? "unknown",
      authorLogin: "forkara-demo",
      mergedAt: new Date(startMs + secondOfDay * 1_000).toISOString(),
    } satisfies MergeFlexReceipt;
  });
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
