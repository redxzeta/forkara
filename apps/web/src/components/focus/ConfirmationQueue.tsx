// FILE: ConfirmationQueue.tsx
// Purpose: In-layout focus-mode confirmation region and lifecycle provider.
// Layer: Focus-mode UI

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { confirmationQueueManager, type ConfirmationQueueManager } from "~/confirmationQueue";
import { Button } from "~/components/ui/button";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { TriangleAlertIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

const ConfirmationQueueContext = createContext<ConfirmationQueueManager | null>(null);

export function ConfirmationQueueProvider(props: {
  readonly children: ReactNode;
  readonly manager?: ConfirmationQueueManager | undefined;
}) {
  const manager = props.manager ?? confirmationQueueManager;
  useEffect(() => () => manager.cancelAll(), [manager]);
  return (
    <ConfirmationQueueContext.Provider value={manager}>
      {props.children}
    </ConfirmationQueueContext.Provider>
  );
}

function useConfirmationQueueManager(): ConfirmationQueueManager {
  const manager = useContext(ConfirmationQueueContext);
  if (!manager) throw new Error("ConfirmationQueueRegion requires ConfirmationQueueProvider.");
  return manager;
}

export function ConfirmationQueueRegion() {
  const manager = useConfirmationQueueManager();
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const request = snapshot.current;

  return (
    <DisclosureRegion open={request !== null}>
      <div
        className="shrink-0 border-t border-border bg-[var(--app-shell-background)] px-3 py-3"
        data-slot="confirmation-queue-region"
      >
        {request ? (
          <section
            aria-label={request.title}
            className={cn(
              "mx-auto w-full max-w-3xl rounded-xl border border-border bg-[var(--color-background-elevated-primary-opaque)] p-3",
              request.destructive && "border-destructive/24 bg-destructive/4",
            )}
            data-slot="confirmation-queue-request"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              manager.cancel(request.id);
            }}
          >
            <div className="flex items-start gap-3">
              {request.destructive ? (
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium text-sm">{request.title}</h2>
                  {request.occurrenceCount > 1 ? (
                    <span
                      aria-label={`${request.occurrenceCount} occurrences`}
                      className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px]"
                    >
                      ×{request.occurrenceCount}
                    </span>
                  ) : null}
                  {snapshot.pendingCount > 0 ? (
                    <span className="text-muted-foreground text-xs">
                      {snapshot.pendingCount} waiting
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-line text-muted-foreground text-sm">
                  {request.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={request.destructive ? "destructive" : "default"}
                    onClick={() => manager.confirm(request.id)}
                  >
                    {request.confirmLabel}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => manager.cancel(request.id)}>
                    {request.cancelLabel ?? "Cancel"}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </DisclosureRegion>
  );
}
