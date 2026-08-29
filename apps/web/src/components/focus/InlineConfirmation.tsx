// FILE: InlineConfirmation.tsx
// Purpose: Explicit, non-modal confirmation that stays in its initiating layout.
// Layer: Focus-mode UI primitive
// Exports: InlineConfirmation

import { TriangleAlertIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { Button, dialogActionButtonClassName } from "~/components/ui/button";

export function InlineConfirmation(props: {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string | undefined;
  readonly destructive?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly secondaryLabel?: string | undefined;
  readonly onSecondary?: (() => void) | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly className?: string | undefined;
}) {
  return (
    <section
      role="group"
      aria-label={props.title}
      className={cn(
        "w-full rounded-xl border border-border bg-[var(--color-background-elevated-primary-opaque)] p-4 text-foreground",
        props.destructive && "border-destructive/24 bg-destructive/4",
        props.className,
      )}
      data-slot="inline-confirmation"
      data-destructive={props.destructive ? "true" : undefined}
    >
      <div className="flex items-start gap-3">
        {props.destructive ? (
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-destructive"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{props.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant={props.destructive ? "destructive" : "default"}
              className={dialogActionButtonClassName}
              disabled={props.disabled}
              onClick={props.onConfirm}
            >
              {props.confirmLabel}
            </Button>
            {props.secondaryLabel && props.onSecondary ? (
              <Button
                variant="outline"
                className={dialogActionButtonClassName}
                disabled={props.disabled}
                onClick={props.onSecondary}
              >
                {props.secondaryLabel}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className={dialogActionButtonClassName}
              disabled={props.disabled}
              onClick={props.onCancel}
            >
              {props.cancelLabel ?? "Cancel"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
