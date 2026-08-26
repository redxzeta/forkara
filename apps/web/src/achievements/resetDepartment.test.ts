import { describe, expect, it, vi } from "vitest";

import { recordResetDepartmentAchievement } from "./resetDepartment";

describe("Reset Department achievement adapter", () => {
  it("forwards deterministic events and isolates recorder failures", () => {
    const record = vi.fn();
    recordResetDepartmentAchievement({ type: "reset.oracle_used", rare: true }, record);
    expect(record).toHaveBeenCalledWith({ type: "reset.oracle_used", rare: true });

    expect(() =>
      recordResetDepartmentAchievement({ type: "reset.hard_reset_succeeded" }, () => {
        throw new Error("recording unavailable");
      }),
    ).not.toThrow();
  });
});
