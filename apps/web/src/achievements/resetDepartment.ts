// FILE: resetDepartment.ts
// Purpose: Exception-isolated Reset Department event adapter for the shared achievement engine.
// Layer: Web achievement integration; source recovery actions never depend on achievement success.

import type { AchievementEvent } from "./catalog";
import { recordAchievementEvent } from "./engine";

export type ResetDepartmentAchievementEvent = Extract<
  AchievementEvent,
  { readonly type: `reset.${string}` }
>;

type AchievementRecorder = (event: AchievementEvent) => unknown;

export function recordResetDepartmentAchievement(
  event: ResetDepartmentAchievementEvent,
  record: AchievementRecorder = recordAchievementEvent,
): void {
  try {
    record(event);
  } catch {
    // Achievements are local decoration and cannot affect the source recovery action.
  }
}
