import { EventId, TurnId, type OrchestrationThreadActivity } from "@forkara/contracts";
import { describe, expect, it, vi } from "vitest";

import { createAchievementEngine } from "./engine";
import {
  BULLY_MODE_CAPTURE_ACTIVITY_KIND,
  recordBullyModeAchievements,
  successfulBullyModeTurnIds,
} from "./bullyMode";

function activity(input: {
  readonly id: string;
  readonly turnId: string;
  readonly kind: string;
  readonly payload: OrchestrationThreadActivity["payload"];
}): OrchestrationThreadActivity {
  return {
    id: EventId.makeUnsafe(input.id),
    turnId: TurnId.makeUnsafe(input.turnId),
    kind: input.kind,
    payload: input.payload,
    summary: input.kind,
    tone: "info",
    createdAt: "2026-08-23T12:00:00.000Z",
  };
}

const capture = (turnId: string, bullyModeEnabled: boolean) =>
  activity({
    id: `capture-${turnId}-${String(bullyModeEnabled)}`,
    turnId,
    kind: BULLY_MODE_CAPTURE_ACTIVITY_KIND,
    payload: { bullyModeEnabled },
  });
const terminal = (turnId: string, state: string) =>
  activity({
    id: `terminal-${turnId}-${state}`,
    turnId,
    kind: "turn.completed",
    payload: { state },
  });
const aborted = (turnId: string) =>
  activity({
    id: `aborted-${turnId}`,
    turnId,
    kind: "turn.aborted",
    payload: { state: "cancelled" },
  });

describe("Bully Mode achievement activity adapter", () => {
  it("emits only for a successfully completed response captured with Bully Mode", () => {
    const record = vi.fn();
    recordBullyModeAchievements([capture("turn-1", true), terminal("turn-1", "completed")], record);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith({
      type: "assistant_response.completed",
      bullyModeEnabled: true,
    });
  });

  it.each(["failed", "interrupted", "cancelled"])("does not emit for a %s completion", (state) => {
    expect(
      successfulBullyModeTurnIds([capture("turn-1", true), terminal("turn-1", state)]),
    ).toEqual([]);
  });

  it("does not emit for a normal-mode completion", () => {
    expect(
      successfulBullyModeTurnIds([capture("turn-1", false), terminal("turn-1", "completed")]),
    ).toEqual([]);
  });

  it("does not emit for an aborted turn", () => {
    expect(successfulBullyModeTurnIds([capture("turn-1", true), aborted("turn-1")])).toEqual([]);
  });

  it("uses the final terminal state when a later abort supersedes completion", () => {
    expect(
      successfulBullyModeTurnIds([
        capture("turn-1", true),
        terminal("turn-1", "completed"),
        aborted("turn-1"),
      ]),
    ).toEqual([]);
  });

  it("keeps the first generation-time attribution if a later value disagrees", () => {
    expect(
      successfulBullyModeTurnIds([
        capture("turn-1", true),
        capture("turn-1", false),
        terminal("turn-1", "completed"),
      ]),
    ).toEqual([TurnId.makeUnsafe("turn-1")]);
  });

  it("uses the shared engine to unlock once across repeated successful responses and reload", () => {
    let persisted: string | null = null;
    const storage = {
      getItem: () => persisted,
      setItem: (_key: string, value: string) => {
        persisted = value;
      },
      removeItem: () => {
        persisted = null;
      },
    };
    const engine = createAchievementEngine({ storage });
    const activities = [
      capture("turn-1", true),
      terminal("turn-1", "completed"),
      capture("turn-2", true),
      terminal("turn-2", "completed"),
    ];
    const record = vi.fn((event) => engine.record(event));
    recordBullyModeAchievements(activities, record);

    expect(record).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().filter((unlock) => unlock.id === "dirt_in_your_eye")).toHaveLength(
      1,
    );
    expect(
      createAchievementEngine({ storage })
        .getSnapshot()
        .some((unlock) => unlock.id === "dirt_in_your_eye"),
    ).toBe(true);
  });
});
