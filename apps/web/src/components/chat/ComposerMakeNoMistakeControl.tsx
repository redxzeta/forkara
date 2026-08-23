// FILE: ComposerMakeNoMistakeControl.tsx
// Purpose: Renders the per-message Make No Mistake intensity control.
// Layer: Chat composer presentation

import type { MakeNoMistakeLevel } from "@forkara/contracts";

import { cn } from "~/lib/utils";
import { nextMakeNoMistakeLevel } from "~/lib/makeNoMistake";
import { Button } from "../ui/button";

const HELP_COPY =
  "Changes response directness and detail for this message only. It does not change the model, tools, permissions, or autonomy.";

export function ComposerMakeNoMistakeControl(props: {
  level: MakeNoMistakeLevel;
  disabled?: boolean;
  onLevelChange: (level: MakeNoMistakeLevel) => void;
}) {
  const nextLevel = nextMakeNoMistakeLevel(props.level);
  const active = props.level > 0;
  const visibleLabel = active ? `Make No Mistake · ${props.level}` : "Make No Mistake";
  const accessibleLabel = active
    ? `Make No Mistake level ${props.level} of 3. Activate for level ${nextLevel}.`
    : "Make No Mistake is off. Activate for level 1.";

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={props.disabled}
      aria-label={accessibleLabel}
      aria-pressed={active}
      title={HELP_COPY}
      className={cn(
        "shrink-0 whitespace-nowrap px-2 text-[length:var(--app-font-size-ui-sm,11px)] font-normal sm:px-3",
        active
          ? "text-[var(--color-text-accent)] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-accent)]"
          : "text-[var(--color-text-foreground-secondary)] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-foreground)]",
      )}
      onClick={() => props.onLevelChange(nextLevel)}
    >
      {visibleLabel}
    </Button>
  );
}
