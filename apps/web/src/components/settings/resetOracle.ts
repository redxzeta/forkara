// FILE: resetOracle.ts
// Purpose: Pure, deterministic selection for Reset Department Oracle responses.

export const RESET_ORACLE_RESPONSES = [
  "Reset immediately.",
  "Ask again after your quota resets.",
  "Definitely delete node_modules.",
  "Git says no.",
  "Outlook not so good.",
  "Try another model.",
  "Have you considered turning Codex off and on again?",
  "42 minutes should do it.",
  "Signs point to upstream.",
] as const;

export const RESET_ORACLE_RARE_RESPONSE = "DO NOT RESET ANYTHING.";
export const RESET_ORACLE_RARE_PROBABILITY = 0.01;

export interface ResetOracleResult {
  readonly response: (typeof RESET_ORACLE_RESPONSES)[number] | typeof RESET_ORACLE_RARE_RESPONSE;
  readonly rare: boolean;
}

export function selectResetOracleResponse(random: () => number = Math.random): ResetOracleResult {
  const roll = random();
  if (roll < RESET_ORACLE_RARE_PROBABILITY) {
    return { response: RESET_ORACLE_RARE_RESPONSE, rare: true };
  }

  const normalized = Math.min(
    1 - Number.EPSILON,
    Math.max(0, (roll - RESET_ORACLE_RARE_PROBABILITY) / (1 - RESET_ORACLE_RARE_PROBABILITY)),
  );
  const index = Math.floor(normalized * RESET_ORACLE_RESPONSES.length);
  const response = RESET_ORACLE_RESPONSES[index];
  if (response === undefined) {
    throw new RangeError("Reset Oracle randomness must produce a finite number");
  }
  return { response, rare: false };
}
