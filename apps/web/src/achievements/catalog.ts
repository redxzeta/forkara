// FILE: catalog.ts
// Purpose: Single catalog of local achievement definitions and deterministic event mappings.
// Layer: Web achievement domain; definitions contain no persistence or UI code.

export type AchievementEvent =
  | { readonly type: "repository.upstream_detected" }
  | { readonly type: "fork.created" }
  | { readonly type: "fork_archaeology.opened" }
  | { readonly type: "upstream_amnesia.enabled" }
  | { readonly type: "license_changer.license_opened" }
  | { readonly type: "license_changer.cancelled" }
  | { readonly type: "readme_truthiness.result" }
  | { readonly type: "parody.blame_someone_else" }
  | { readonly type: "originality_meter.result" }
  | { readonly type: "apology.stage_reached"; readonly stageIndex: number }
  | { readonly type: "fork_family_tree.viewed"; readonly knownGenerationCount: number };

interface AchievementDefinitionShape {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  readonly secret: boolean;
  readonly unlocks: (event: AchievementEvent) => boolean;
}

export const ACHIEVEMENT_CATALOG = [
  {
    id: "built_from_scratch",
    title: "Built From Scratch",
    description: "Open a repository with a known upstream.",
    icon: "🏆",
    secret: false,
    unlocks: (event) => event.type === "repository.upstream_detected",
  },
  {
    id: "fork_around_and_find_out",
    title: "Fork Around and Find Out",
    description: "Create a fork through Forkara.",
    icon: "🍴",
    secret: false,
    unlocks: (event) => event.type === "fork.created",
  },
  {
    id: "git_has_receipts",
    title: "Git Has Receipts",
    description: "Open Fork Archaeology.",
    icon: "🕵️",
    secret: false,
    unlocks: (event) => event.type === "fork_archaeology.opened",
  },
  {
    id: "i_remember_nothing",
    title: "I Remember Nothing",
    description: "Enable Upstream Amnesia.",
    icon: "🧠",
    secret: false,
    unlocks: (event) => event.type === "upstream_amnesia.enabled",
  },
  {
    id: "terms_and_conditions_apply",
    title: "Terms and Conditions Apply",
    description: "Open the current LICENSE from the License Changer warning.",
    icon: "📜",
    secret: false,
    unlocks: (event) => event.type === "license_changer.license_opened",
  },
  {
    id: "legal_department_mvp",
    title: "Legal Department MVP",
    description: "Cancel the License Changer flow.",
    icon: "🛑",
    secret: false,
    unlocks: (event) => event.type === "license_changer.cancelled",
  },
  {
    id: "technically_ambitious",
    title: "Technically Ambitious",
    description: "Run README Truthiness Checker and get a factual result.",
    icon: "📝",
    secret: false,
    unlocks: (event) => event.type === "readme_truthiness.result",
  },
  {
    id: "forty_two",
    title: "42",
    description: "You know what you did.",
    icon: "⏱️",
    secret: true,
    unlocks: (event) => event.type === "parody.blame_someone_else",
  },
  {
    id: "original_visionary",
    title: "Original Visionary",
    description: "Reveal an Originality Meter result.",
    icon: "📈",
    secret: false,
    unlocks: (event) => event.type === "originality_meter.result",
  },
  {
    id: "double_down",
    title: "Double Down",
    description: "Reach Double Down in the apology progression.",
    icon: "😤",
    secret: false,
    unlocks: (event) => event.type === "apology.stage_reached" && event.stageIndex >= 2,
  },
  {
    id: "fork_isnt_that_bad",
    title: "The Fork Isn't That Bad",
    description: "Reach the first honest breakthrough in the apology progression.",
    icon: "🥺",
    secret: false,
    unlocks: (event) => event.type === "apology.stage_reached" && event.stageIndex >= 3,
  },
  {
    id: "redemption_arc",
    title: "Redemption Arc",
    description: "Reach Actual Apology.",
    icon: "❤️",
    secret: false,
    unlocks: (event) => event.type === "apology.stage_reached" && event.stageIndex >= 5,
  },
  {
    id: "family_reunion",
    title: "Family Reunion",
    description: "View at least three known generations in Fork Family Tree.",
    icon: "🌳",
    secret: false,
    unlocks: (event) => event.type === "fork_family_tree.viewed" && event.knownGenerationCount >= 3,
  },
] as const satisfies readonly AchievementDefinitionShape[];

export type AchievementDefinition = (typeof ACHIEVEMENT_CATALOG)[number];
export type AchievementId = AchievementDefinition["id"];

export const ACHIEVEMENT_DEFINITION_BY_ID = new Map<AchievementId, AchievementDefinition>(
  ACHIEVEMENT_CATALOG.map((definition) => [definition.id, definition]),
);

export function isAchievementId(value: string): value is AchievementId {
  return ACHIEVEMENT_DEFINITION_BY_ID.has(value as AchievementId);
}
