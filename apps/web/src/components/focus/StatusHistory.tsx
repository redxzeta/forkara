// FILE: StatusHistory.tsx
// Purpose: Provider and portal-free dock for session-only operation status history.
// Layer: Focus-mode UI
// Exports: StatusHistoryProvider, StatusHistoryDock, useStatusHistory

import {
  createContext,
  useContext,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  type StatusHistoryEntry,
  type StatusHistoryEntryInput,
  type StatusHistoryManager,
  type StatusHistoryTone,
  statusHistoryManager,
} from "~/statusHistory";
import {
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CopyIcon,
  HistoryIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { Button } from "~/components/ui/button";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { notificationSurfaceClassName } from "~/components/ui/notificationSurface";

const StatusHistoryContext = createContext<StatusHistoryManager | null>(null);

export function StatusHistoryProvider(props: {
  readonly children: ReactNode;
  readonly manager?: StatusHistoryManager | undefined;
}) {
  return (
    <StatusHistoryContext.Provider value={props.manager ?? statusHistoryManager}>
      {props.children}
    </StatusHistoryContext.Provider>
  );
}

export function useStatusHistory(): {
  readonly entries: ReadonlyArray<StatusHistoryEntry>;
  readonly add: (entry: StatusHistoryEntryInput) => string;
  readonly dismiss: (entryId: string) => void;
  readonly clear: () => void;
} {
  const manager = useContext(StatusHistoryContext);
  if (manager === null) {
    throw new Error("useStatusHistory must be used within StatusHistoryProvider.");
  }
  const entries = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  return {
    entries,
    add: manager.add,
    dismiss: manager.dismiss,
    clear: manager.clear,
  };
}

function ToneIcon(props: { readonly tone: StatusHistoryTone }) {
  if (props.tone === "success") {
    return <CircleCheckIcon aria-hidden="true" />;
  }
  if (props.tone === "warning") {
    return <TriangleAlertIcon aria-hidden="true" />;
  }
  if (props.tone === "error") {
    return <CircleAlertIcon aria-hidden="true" />;
  }
  if (props.tone === "loading") {
    return (
      <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
    );
  }
  return <InfoIcon aria-hidden="true" />;
}

function StatusHistoryEntryCard(props: {
  readonly entry: StatusHistoryEntry;
  readonly onDismiss: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const hasDetails = Boolean(
    props.entry.correctiveAction || props.entry.technicalDetails || props.entry.copyText,
  );

  return (
    <li className="border-t border-border/65 px-3 py-3 first:border-t-0">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4",
            props.entry.tone === "error" && "text-destructive",
            props.entry.tone === "success" && "text-emerald-600 dark:text-emerald-400",
            props.entry.tone === "warning" && "text-amber-600 dark:text-amber-400",
          )}
        >
          <ToneIcon tone={props.entry.tone} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{props.entry.title}</p>
              {props.entry.summary ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{props.entry.summary}</p>
              ) : null}
            </div>
            {props.entry.occurrenceCount > 1 ? (
              <span
                aria-label={`${props.entry.occurrenceCount} occurrences`}
                className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
              >
                ×{props.entry.occurrenceCount}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Dismiss ${props.entry.title}`}
              onClick={props.onDismiss}
            >
              <XIcon />
            </Button>
          </div>

          {hasDetails ? (
            <div className="mt-1">
              <Button
                variant="ghost"
                size="xs"
                aria-controls={detailsId}
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                <DisclosureChevron open={detailsOpen} />
                Details
              </Button>
              <DisclosureRegion open={detailsOpen}>
                <div id={detailsId} className="space-y-2 pt-2 text-xs text-muted-foreground">
                  {props.entry.correctiveAction ? <p>{props.entry.correctiveAction}</p> : null}
                  {props.entry.technicalDetails ? (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-2 font-mono text-[11px]">
                      {props.entry.technicalDetails}
                    </pre>
                  ) : null}
                  {props.entry.copyText ? (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => copyToClipboard(props.entry.copyText!, undefined)}
                    >
                      {isCopied ? <CheckIcon /> : <CopyIcon />}
                      {isCopied ? "Copied" : "Copy"}
                    </Button>
                  ) : null}
                </div>
              </DisclosureRegion>
            </div>
          ) : null}

          {props.entry.actions && props.entry.actions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {props.entry.actions.map((action) => (
                <Button
                  key={action.id}
                  variant={action.kind === "retry" ? "primary-outline" : "outline"}
                  size="xs"
                  aria-label={action.ariaLabel}
                  onClick={() => void action.onAction()}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function StatusHistoryDock() {
  const { entries, dismiss, clear } = useStatusHistory();
  const [open, setOpen] = useState(false);
  const historyId = useId();

  if (entries.length === 0) {
    return null;
  }

  const latest = entries[0]!;
  return (
    <aside
      aria-label="Status history"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-40 w-[min(26rem,calc(100vw-2rem))]"
      data-slot="status-history-dock"
    >
      <div
        className={cn(
          notificationSurfaceClassName({
            compact: false,
            tone: latest.tone === "error" ? "error" : "default",
          }),
          "pointer-events-auto overflow-hidden",
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <HistoryIcon aria-hidden="true" className="size-4 shrink-0" />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-controls={historyId}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="min-w-0 flex-1 truncate font-medium">{latest.title}</span>
            <span className="text-xs text-muted-foreground">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
            <DisclosureChevron open={open} />
          </button>
        </div>
        <DisclosureRegion open={open}>
          <div id={historyId} className="border-t border-border/65">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">This session</p>
              <Button variant="ghost" size="xs" onClick={clear}>
                Clear history
              </Button>
            </div>
            <ol className="max-h-[min(28rem,60vh)] overflow-y-auto border-t border-border/65">
              {entries.map((entry) => (
                <StatusHistoryEntryCard
                  key={entry.id}
                  entry={entry}
                  onDismiss={() => dismiss(entry.id)}
                />
              ))}
            </ol>
          </div>
        </DisclosureRegion>
      </div>
    </aside>
  );
}
