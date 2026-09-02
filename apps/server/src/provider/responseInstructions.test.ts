import { describe, expect, it } from "vitest";

import { PROVIDER_BULLY_MODE_PROMPT_PREFIX } from "./bullyMode.ts";
import { PROVIDER_DEBUG_MODE_PROMPT_PREFIX } from "./debugMode.ts";
import { PROVIDER_MAKE_NO_MISTAKE_PROMPT_PREFIX } from "./makeNoMistake.ts";
import {
  providerResponseInstructionsOverheadChars,
  withProviderResponseInstructions,
} from "./responseInstructions.ts";

describe("provider response instructions", () => {
  it("preserves normal input when no response modifier applies", () => {
    expect(withProviderResponseInstructions({ text: "hello" })).toBe("hello");
  });

  it("composes Bully with Debug idempotently", () => {
    const once = withProviderResponseInstructions({
      text: "Investigate the crash",
      interactionMode: "debug",
      modifiers: { bullyMode: true },
    });
    const twice = withProviderResponseInstructions({
      text: once,
      interactionMode: "debug",
      modifiers: { bullyMode: true },
    });

    expect(once).toContain("Investigate the crash");
    expect(once.split(PROVIDER_DEBUG_MODE_PROMPT_PREFIX)).toHaveLength(2);
    expect(once.split(PROVIDER_BULLY_MODE_PROMPT_PREFIX)).toHaveLength(2);
    expect(twice).toBe(once);
  });

  it("composes Bully with a persistent goal idempotently", () => {
    const input = {
      text: "Take the next step",
      goal: "Ship the feature safely",
      modifiers: { bullyMode: true },
    } as const;
    const once = withProviderResponseInstructions(input);
    const twice = withProviderResponseInstructions({ ...input, text: once });

    expect(once).toContain("<forkara_goal>");
    expect(once).toContain("Ship the feature safely");
    expect(once).toContain("Take the next step");
    expect(once.split(PROVIDER_BULLY_MODE_PROMPT_PREFIX)).toHaveLength(2);
    expect(twice).toBe(once);
  });

  it("reports exact combined overhead for non-empty input", () => {
    const input = {
      interactionMode: "debug" as const,
      goal: "Finish the objective",
      modifiers: { bullyMode: true },
    };
    const text = "continue";

    expect(withProviderResponseInstructions({ ...input, text })).toHaveLength(
      text.length + providerResponseInstructionsOverheadChars(input),
    );
    expect(providerResponseInstructionsOverheadChars({})).toBe(0);
  });

  it("composes Make No Mistake with Bully Mode without replacing either modifier", () => {
    const input = {
      text: "Review the queue drain",
      modifiers: { bullyMode: true, makeNoMistakeLevel: 3 as const },
    };
    const once = withProviderResponseInstructions(input);
    const twice = withProviderResponseInstructions({ ...input, text: once });

    expect(once).toContain("Review the queue drain");
    expect(once.split(PROVIDER_BULLY_MODE_PROMPT_PREFIX)).toHaveLength(2);
    expect(once.split(PROVIDER_MAKE_NO_MISTAKE_PROMPT_PREFIX)).toHaveLength(2);
    expect(once).toContain("edge cases");
    expect(twice).toBe(once);
  });
});
