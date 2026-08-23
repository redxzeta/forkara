import { afterEach, describe, expect, it } from "vitest";

import { formatLocalCalendarDate, localCalendarDayRange } from "./localCalendarDay";

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("local calendar day", () => {
  it("formats local date parts without UTC conversion", () => {
    expect(formatLocalCalendarDate(new Date(2026, 7, 23, 23, 30))).toBe("2026-08-23");
  });

  it("uses the previous local date near a UTC boundary", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(localCalendarDayRange(new Date("2026-08-24T01:30:00.000Z"))).toEqual({
      date: "2026-08-23",
      startedAt: "2026-08-23T07:00:00.000Z",
      endedAt: "2026-08-24T07:00:00.000Z",
    });
  });

  it("preserves daylight-saving local-day boundaries", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(localCalendarDayRange(new Date("2026-03-08T18:00:00.000Z"))).toEqual({
      date: "2026-03-08",
      startedAt: "2026-03-08T08:00:00.000Z",
      endedAt: "2026-03-09T07:00:00.000Z",
    });
  });
});
