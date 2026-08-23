// FILE: bullyMode.ts
// Purpose: Join server-captured generation modifiers to factual successful turn completions.
// Layer: Achievement event adapter over the existing persisted thread activity stream.

import type { OrchestrationThreadActivity, TurnId } from "@forkara/contracts";
import { BULLY_MODE_CAPTURE_ACTIVITY_KIND } from "@forkara/shared/achievementActivities";

import { recordAchievementEvent } from "./engine";

export { BULLY_MODE_CAPTURE_ACTIVITY_KIND } from "@forkara/shared/achievementActivities";

function payloadRecord(activity: OrchestrationThreadActivity): Record<string, unknown> | null {
  return activity.payload &&
    typeof activity.payload === "object" &&
    !Array.isArray(activity.payload)
    ? (activity.payload as Record<string, unknown>)
    : null;
}

export function successfulBullyModeTurnIds(
  activities: readonly OrchestrationThreadActivity[],
): readonly TurnId[] {
  const capturedByTurnId = new Map<TurnId, boolean>();
  const terminalStateByTurnId = new Map<TurnId, string>();

  for (const activity of activities) {
    if (activity.turnId === null) continue;
    const payload = payloadRecord(activity);
    if (activity.kind === BULLY_MODE_CAPTURE_ACTIVITY_KIND) {
      if (
        !capturedByTurnId.has(activity.turnId) &&
        typeof payload?.bullyModeEnabled === "boolean"
      ) {
        capturedByTurnId.set(activity.turnId, payload.bullyModeEnabled);
      }
      continue;
    }
    if (activity.kind === "turn.completed" && typeof payload?.state === "string") {
      terminalStateByTurnId.set(activity.turnId, payload.state);
    } else if (activity.kind === "turn.aborted") {
      terminalStateByTurnId.set(activity.turnId, "aborted");
    }
  }

  return [...terminalStateByTurnId].flatMap(([turnId, state]) =>
    state === "completed" && capturedByTurnId.get(turnId) === true ? [turnId] : [],
  );
}

export function recordBullyModeAchievements(
  activities: readonly OrchestrationThreadActivity[],
  record: typeof recordAchievementEvent = recordAchievementEvent,
): void {
  for (const _turnId of successfulBullyModeTurnIds(activities)) {
    record({ type: "assistant_response.completed", bullyModeEnabled: true });
  }
}
