import { describe, expect, it } from "vitest";

import { makeNoMistakeResponseModifiers, nextMakeNoMistakeLevel } from "./makeNoMistake";

describe("Make No Mistake composer state", () => {
  it("cycles through exactly four bounded levels", () => {
    expect(nextMakeNoMistakeLevel(0)).toBe(1);
    expect(nextMakeNoMistakeLevel(1)).toBe(2);
    expect(nextMakeNoMistakeLevel(2)).toBe(3);
    expect(nextMakeNoMistakeLevel(3)).toBe(0);
  });

  it("omits turn metadata at level zero and captures active levels", () => {
    expect(makeNoMistakeResponseModifiers(0)).toBeUndefined();
    expect(makeNoMistakeResponseModifiers(1)).toEqual({ makeNoMistakeLevel: 1 });
    expect(makeNoMistakeResponseModifiers(3)).toEqual({ makeNoMistakeLevel: 3 });
  });
});
