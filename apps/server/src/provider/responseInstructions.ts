// FILE: responseInstructions.ts
// Purpose: Centrally composes provider-independent response instruction overlays.
// Layer: Provider prompt policy

import type { ProviderInteractionMode } from "@forkara/contracts";

import { PROVIDER_DEBUG_MODE_PROMPT_PREFIX, withProviderDebugModePrompt } from "./debugMode.ts";
import { withProviderGoalPrompt } from "./goalMode.ts";
import { withProviderBullyModePrompt } from "./bullyMode.ts";

export interface ProviderResponseModifierState {
  readonly bullyMode?: boolean | undefined;
}

export interface ProviderResponseInstructionsInput {
  readonly text: string;
  readonly interactionMode?: ProviderInteractionMode | undefined;
  readonly goal?: string | undefined;
  readonly modifiers?: ProviderResponseModifierState | undefined;
}

/**
 * The canonical provider-independent composition seam for instructions that
 * shape an assistant response without changing durable user-authored history.
 */
export function withProviderResponseInstructions(input: ProviderResponseInstructionsInput): string {
  // Debug's legacy helper only recognizes its prompt at the start. The generic
  // seam may wrap it with other modifiers, so recognize an existing exact block
  // before recomposition to keep the whole operation idempotent.
  const withDebug = input.text.includes(PROVIDER_DEBUG_MODE_PROMPT_PREFIX)
    ? input.text
    : withProviderDebugModePrompt({
        interactionMode: input.interactionMode,
        text: input.text,
      });
  const withModifiers = withProviderBullyModePrompt({
    enabled: input.modifiers?.bullyMode,
    text: withDebug,
  });

  return withProviderGoalPrompt({
    goal: input.goal,
    text: withModifiers,
  });
}

export function providerResponseInstructionsOverheadChars(
  input: Omit<ProviderResponseInstructionsInput, "text">,
): number {
  const sentinel = "x";
  return withProviderResponseInstructions({ ...input, text: sentinel }).length - sentinel.length;
}
