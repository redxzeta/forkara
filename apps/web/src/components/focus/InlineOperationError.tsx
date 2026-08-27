// FILE: InlineOperationError.tsx
// Purpose: Corrective, non-modal operation failure surface.
// Layer: Focus-mode UI primitive
// Exports: InlineOperationError

import { useId, useState } from "react";

import { CircleAlertIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { Button, dialogActionButtonClassName } from "~/components/ui/button";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { notificationSurfaceClassName } from "~/components/ui/notificationSurface";

export function InlineOperationError(props: {
  readonly summary: string;
  readonly correctiveAction: string;
  readonly technicalDetails?: string | undefined;
  readonly retryLabel?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly onDismiss?: (() => void) | undefined;
  readonly className?: string | undefined;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();

  return (
    <section
      role="alert"
      aria-label="Operation failed"
      className={cn(
        notificationSurfaceClassName({ compact: false, tone: "error" }),
        "p-4",
        props.className,
      )}
      data-slot="inline-operation-error"
    >
      <div className="flex items-start gap-3">
        <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--notification-fg)]">{props.summary}</p>
          <p className="mt-1 text-sm text-[var(--notification-fg)]/72">{props.correctiveAction}</p>

          {props.technicalDetails ? (
            <div className="mt-2">
              <Button
                variant="ghost"
                size="xs"
                aria-controls={detailsId}
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                <DisclosureChevron open={detailsOpen} />
                Technical details
              </Button>
              <DisclosureRegion open={detailsOpen}>
                <pre
                  id={detailsId}
                  className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/55 p-3 font-mono text-xs text-[var(--notification-fg)]/72"
                >
                  {props.technicalDetails}
                </pre>
              </DisclosureRegion>
            </div>
          ) : null}

          {props.onRetry || props.onDismiss ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {props.onRetry ? (
                <Button
                  variant="destructive-outline"
                  className={dialogActionButtonClassName}
                  onClick={props.onRetry}
                >
                  {props.retryLabel ?? "Retry"}
                </Button>
              ) : null}
              {props.onDismiss ? (
                <Button
                  variant="outline"
                  className={dialogActionButtonClassName}
                  onClick={props.onDismiss}
                >
                  Dismiss
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
