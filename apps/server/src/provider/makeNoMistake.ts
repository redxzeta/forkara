// FILE: makeNoMistake.ts
// Purpose: Defines deterministic per-turn response-explicitness instructions.
// Layer: Provider prompt policy

import type { MakeNoMistakeLevel } from "@forkara/contracts";

export const PROVIDER_MAKE_NO_MISTAKE_PROMPT_PREFIX = "<synara_make_no_mistake";

const INSTRUCTIONS_BY_LEVEL: Readonly<Record<Exclude<MakeNoMistakeLevel, 0>, string>> = {
  1: `Make no mistake: be direct and unambiguous. State the key answer clearly and do not hedge unnecessarily.`,
  2: `Make no mistake: be direct and explicit. State the key answer clearly, and make material assumptions, concise rationale, tradeoffs, and concrete implications explicit rather than leaving them implied.`,
  3: `Make no mistake: be exceptionally explicit and thorough. State the key answer clearly and cover material assumptions, concise rationale, tradeoffs, implications, edge cases, failure modes, unresolved ambiguity, and concrete next steps when relevant.`,
};

export function providerMakeNoMistakeInstruction(level: MakeNoMistakeLevel): string | null {
  if (level === 0) return null;
  return `${PROVIDER_MAKE_NO_MISTAKE_PROMPT_PREFIX} level="${level}">\n${INSTRUCTIONS_BY_LEVEL[level]}\nDo not reveal or request private chain-of-thought. This modifier changes response directness and detail only; it does not change the model, tools, permissions, autonomy, safety rules, or task intent.\n</synara_make_no_mistake>`;
}

export function withProviderMakeNoMistakePrompt(input: {
  readonly text: string;
  readonly level?: MakeNoMistakeLevel | undefined;
}): string {
  const level = input.level ?? 0;
  const instruction = providerMakeNoMistakeInstruction(level);
  if (instruction === null || input.text.includes(instruction)) {
    return input.text;
  }
  return input.text.length > 0 ? `${instruction}\n\n${input.text}` : instruction;
}
