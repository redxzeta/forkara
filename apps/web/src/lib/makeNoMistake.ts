// FILE: makeNoMistake.ts
// Purpose: Owns the bounded composer-level progression and turn metadata mapping.
// Layer: Chat composer domain

import type { MakeNoMistakeLevel, ProviderResponseModifiers } from "@forkara/contracts";

export function nextMakeNoMistakeLevel(level: MakeNoMistakeLevel): MakeNoMistakeLevel {
  return level === 3 ? 0 : ((level + 1) as MakeNoMistakeLevel);
}

export function makeNoMistakeResponseModifiers(
  level: MakeNoMistakeLevel,
): ProviderResponseModifiers | undefined {
  return level === 0 ? undefined : { makeNoMistakeLevel: level };
}
