// FILE: ComposerBullyModeIndicator.tsx
// Purpose: Shows and disables the shared Bully Mode setting from the normal composer surface.
// Layer: Chat composer presentation

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const HELP_COPY =
  "Bully Mode changes response tone only. It does not change the model, tools, permissions, confirmations, or capabilities.";

export function ComposerBullyModeIndicator(props: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  if (!props.enabled) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Disable Bully Mode"
            aria-pressed={true}
            className="shrink-0 whitespace-nowrap px-2 text-[length:var(--app-font-size-ui-sm,11px)] font-medium text-[var(--color-text-accent)] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-accent)] sm:px-3"
            onClick={() => props.onEnabledChange(false)}
          >
            Bully Mode
          </Button>
        }
      />
      <TooltipPopup side="top" className="max-w-80 whitespace-normal leading-tight">
        {HELP_COPY}
      </TooltipPopup>
    </Tooltip>
  );
}
