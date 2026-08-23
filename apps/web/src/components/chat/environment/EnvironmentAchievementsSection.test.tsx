import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AchievementViewer, achievementViewerRows } from "./EnvironmentAchievementsSection";

describe("achievement viewer", () => {
  it("hides a secret achievement until its deterministic unlock exists", () => {
    const locked = achievementViewerRows([]).find((row) => row.id === "forty_two");
    const unlocked = achievementViewerRows([
      { id: "forty_two", unlockedAt: "2026-08-23T12:00:00.000Z" },
    ]).find((row) => row.id === "forty_two");

    expect(locked).toMatchObject({
      title: "Secret achievement",
      description: "Hidden until unlocked.",
      icon: "?",
    });
    expect(unlocked).toMatchObject({ title: "42", description: "You know what you did." });
  });

  it("states the local-only persistence boundary", () => {
    expect(renderToStaticMarkup(<AchievementViewer snapshot={[]} />)).toContain(
      "No account sync, network request, or telemetry.",
    );
  });
});
