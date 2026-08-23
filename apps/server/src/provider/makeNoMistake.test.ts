import { describe, expect, it } from "vitest";

import {
  PROVIDER_MAKE_NO_MISTAKE_PROMPT_PREFIX,
  providerMakeNoMistakeInstruction,
  withProviderMakeNoMistakePrompt,
} from "./makeNoMistake.ts";

describe("provider Make No Mistake prompt", () => {
  it("leaves provider input unchanged at level zero", () => {
    expect(withProviderMakeNoMistakePrompt({ text: "Explain the failure", level: 0 })).toBe(
      "Explain the failure",
    );
  });

  it("maps levels one through three to progressively stronger semantics", () => {
    expect(providerMakeNoMistakeInstruction(1)).toContain("direct and unambiguous");
    expect(providerMakeNoMistakeInstruction(2)).toContain("material assumptions");
    expect(providerMakeNoMistakeInstruction(2)).toContain("tradeoffs");
    expect(providerMakeNoMistakeInstruction(3)).toContain("edge cases");
    expect(providerMakeNoMistakeInstruction(3)).toContain("failure modes");
    expect(providerMakeNoMistakeInstruction(3)).toContain("concrete next steps");
  });

  it("adds the captured level once without changing the user text", () => {
    const userText = "Explain the reconnect bug";
    const once = withProviderMakeNoMistakePrompt({ text: userText, level: 3 });
    const twice = withProviderMakeNoMistakePrompt({ text: once, level: 3 });

    expect(once.endsWith(userText)).toBe(true);
    expect(once.split(PROVIDER_MAKE_NO_MISTAKE_PROMPT_PREFIX)).toHaveLength(2);
    expect(twice).toBe(once);
  });

  it("does not let user-authored marker text suppress the instruction", () => {
    const userText = `${PROVIDER_MAKE_NO_MISTAKE_PROMPT_PREFIX} is just text`;
    const result = withProviderMakeNoMistakePrompt({ text: userText, level: 1 });

    expect(result).toContain(providerMakeNoMistakeInstruction(1));
    expect(result.endsWith(userText)).toBe(true);
  });

  it("requests concise rationale without requesting private reasoning", () => {
    const result = providerMakeNoMistakeInstruction(3);
    expect(result).toContain("concise rationale");
    expect(result).toContain("Do not reveal or request private chain-of-thought");
    expect(result).toContain("does not change the model, tools, permissions, autonomy");
  });
});
