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
  | { readonly type: "assistant_response.completed"; readonly bullyModeEnabled: boolean }
  | { readonly type: "apology.stage_reached"; readonly stageIndex: number }
  | { readonly type: "fork_family_tree.viewed"; readonly knownGenerationCount: number }
  | { readonly type: "reset.oracle_used"; readonly rare: boolean }
  | { readonly type: "reset.dependency_exorcism_succeeded" }
  | { readonly type: "reset.quota_parody_used" }
  | { readonly type: "reset.hard_reset_succeeded" }
  | {
      readonly type: "reset.hard_reset_alternative_chosen";
      readonly choice: "cancel" | "stash";
    };

export const RESET_TOOL_IDS = [
  "oracle",
  "dependency-exorcism",
  "quota-parody",
  "hard-reset",
] as const;
export type ResetToolId = (typeof RESET_TOOL_IDS)[number];

export interface AchievementProgress {
  readonly oracleUseCount: number;
  readonly resetToolIds: readonly ResetToolId[];
}

interface AchievementDefinitionShape {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  readonly secret: boolean;
  readonly unlocks: (event: AchievementEvent, progress: AchievementProgress) => boolean;
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
    id: "dirt_in_your_eye",
    title: "Dirt in Your Eye",
    description: "Complete your first response with Bully Mode enabled.",
    icon: "👁️",
    secret: false,
    unlocks: (event) => event.type === "assistant_response.completed" && event.bullyModeEnabled,
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
  {
    id: "ask_again_later",
    title: "Ask Again Later",
    description: "Consult the Reset Oracle three times.",
    icon: "🎱",
    secret: false,
    unlocks: (event, progress) =>
      event.type === "reset.oracle_used" && progress.oracleUseCount >= 3,
  },
  {
    id: "node_modules_were_the_problem",
    title: "Node Modules Were the Problem",
    description: "Successfully complete Dependency Exorcism.",
    icon: "🧹",
    secret: false,
    unlocks: (event) => event.type === "reset.dependency_exorcism_succeeded",
  },
  {
    id: "have_you_tried_resetting_it",
    title: "Have You Tried Resetting It?",
    description: "Use two distinct Reset Department tools.",
    icon: "♻️",
    secret: false,
    unlocks: (_event, progress) => progress.resetToolIds.length >= 2,
  },
  {
    id: "hard_reset_enjoyer",
    title: "Hard Reset Enjoyer",
    description: "Successfully complete the guarded hard reset.",
    icon: "☢️",
    secret: false,
    unlocks: (event) => event.type === "reset.hard_reset_succeeded",
  },
  {
    id: "character_development",
    title: "Character Development",
    description: "Choose Cancel or Stash Changes Instead in the hard-reset flow.",
    icon: "🛑",
    secret: false,
    unlocks: (event) => event.type === "reset.hard_reset_alternative_chosen",
  },
  {
    id: "oracle_has_spoken",
    title: "The Oracle Has Spoken",
    description: "Receive the Reset Oracle's rare warning.",
    icon: "🎱",
    secret: true,
    unlocks: (event) => event.type === "reset.oracle_used" && event.rare,
  },
  {
    id: "reset_pending",
    title: "Reset Pending",
    description: "Try the quota reset parody. Completion is approximately 42 minutes away.",
    icon: "⏳",
    secret: false,
    unlocks: (event) => event.type === "reset.quota_parody_used",
  },
  // Deferred by design: dependency reinstall and subsequent commit events are not reliably
  // observable in the current architecture, so Dependency Exorcist and Maybe Commit First are
  // intentionally absent rather than unlocked from guesses.
] as const satisfies readonly AchievementDefinitionShape[];

export type AchievementDefinition = (typeof ACHIEVEMENT_CATALOG)[number];
export type AchievementId = AchievementDefinition["id"];

export const ACHIEVEMENT_DEFINITION_BY_ID = new Map<AchievementId, AchievementDefinition>(
  ACHIEVEMENT_CATALOG.map((definition) => [definition.id, definition]),
);

export function isAchievementId(value: string): value is AchievementId {
  return ACHIEVEMENT_DEFINITION_BY_ID.has(value as AchievementId);
}
