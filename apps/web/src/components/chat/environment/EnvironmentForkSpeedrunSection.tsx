// FILE: EnvironmentForkSpeedrunSection.tsx
// Purpose: Opt-in, local-only display of factual fork milestone receipts.
// Layer: Environment panel section and details dialog

import type {
  GitForkSpeedrunMilestoneKind,
  GitForkSpeedrunResult,
  ProjectId,
} from "@forkara/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { isForkSpeedrunEnabled, setForkSpeedrunEnabled } from "~/lib/forkSpeedrunPreference";
import { ClockIcon, RefreshCwIcon } from "~/lib/icons";
import { GIT_EXPENSIVE_READ_RETRY_OPTIONS, gitQueryKeys } from "~/lib/gitReactQuery";
import { ensureNativeApi } from "~/nativeApi";
import { toastManager } from "~/components/ui/toast";

import {
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
} from "./EnvironmentRow";

export function formatSpeedrunElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(remainingSeconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function missingLabel(kind: GitForkSpeedrunMilestoneKind): string {
  switch (kind) {
    case "first_fork_commit":
      return "First fork-only commit";
    case "readme_changed":
      return "README changed";
  }
}

export function ForkSpeedrunReport({ result }: { result: GitForkSpeedrunResult }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">Local receipts only</p>
        <p className="mt-1 text-sm">{result.message}</p>
      </div>
      <section aria-labelledby="fork-speedrun-timeline-heading" className="space-y-2">
        <h3 id="fork-speedrun-timeline-heading" className="font-medium text-sm">
          Fork Speedrun
        </h3>
        <ol className="space-y-2">
          {result.events.map((event) => (
            <li key={event.kind} className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{event.label}</p>
                  {event.commit ? (
                    <p className="mt-0.5 truncate text-muted-foreground text-xs">
                      <code>{event.commit.shortSha}</code> {event.commit.subject}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      Forkara project creation receipt
                    </p>
                  )}
                </div>
                <time
                  dateTime={event.occurredAt}
                  className="shrink-0 font-mono text-xs tabular-nums"
                  aria-label={`${event.label}, ${event.elapsedSeconds} seconds after project added`}
                >
                  {formatSpeedrunElapsed(event.elapsedSeconds)}
                </time>
              </div>
            </li>
          ))}
        </ol>
        {result.missingEvents.length > 0 ? (
          <div className="rounded-lg border border-dashed border-border p-2.5">
            <p className="font-medium text-muted-foreground text-xs">Not recorded yet</p>
            <ul className="mt-1 space-y-1 text-muted-foreground text-xs">
              {result.missingEvents.map((kind) => (
                <li key={kind}>• {missingLabel(kind)} — no timestamp</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <section aria-labelledby="fork-speedrun-method-heading" className="space-y-1.5">
        <h3 id="fork-speedrun-method-heading" className="font-medium text-sm">
          Event derivation
        </h3>
        <p className="text-muted-foreground text-xs">
          The clock starts at the server-recorded time this project was added to Forkara. Commit
          milestones use committer timestamps from exact merge-base..HEAD history and only count
          events at or after that start. README changes use Git path history. No branding or PR
          milestone appears because Forkara does not yet retain trustworthy receipts for them.
        </p>
        <p className="text-muted-foreground text-xs">
          Display-only. No telemetry, global ranking, or external leaderboard.
        </p>
      </section>
    </div>
  );
}

export function EnvironmentForkSpeedrunSection({
  gitCwd,
  projectId,
  projectCreatedAt,
  enabled,
}: {
  gitCwd: string | null;
  projectId: ProjectId | null;
  projectCreatedAt: string | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [optedIn, setOptedIn] = useState(() =>
    projectId && typeof localStorage !== "undefined"
      ? isForkSpeedrunEnabled(projectId, localStorage)
      : false,
  );
  const speedrunQuery = useQuery({
    queryKey: [...gitQueryKeys.forkSpeedrun(gitCwd), projectCreatedAt],
    queryFn: () => {
      if (!gitCwd || !projectCreatedAt) throw new Error("Project timing is unavailable.");
      return ensureNativeApi().git.forkSpeedrun({ cwd: gitCwd, startedAt: projectCreatedAt });
    },
    enabled: enabled && open && optedIn && gitCwd !== null && projectCreatedAt !== null,
    staleTime: 60_000,
    ...GIT_EXPENSIVE_READ_RETRY_OPTIONS,
  });
  if (!enabled || !gitCwd || !projectId || !projectCreatedAt) return null;

  const updateOptIn = (next: boolean) => {
    const persisted =
      typeof localStorage !== "undefined" && setForkSpeedrunEnabled(projectId, next, localStorage);
    if (!persisted) {
      toastManager.add({
        type: "warning",
        title: "Local preference could not be saved",
        description: "Fork Speedrun will stay in this state only for the current session.",
      });
    }
    setOptedIn(next);
  };

  return (
    <EnvironmentLabeledSection label="Fork Lore">
      <EnvironmentRow
        icon={<ClockIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
        label="Fork Speedrun"
        trailing={
          speedrunQuery.isFetching ? (
            <RefreshCwIcon className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : optedIn ? (
            <span className="text-muted-foreground text-xs">Local</span>
          ) : null
        }
        title="Show an opt-in local timeline of factual fork milestones"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fork Speedrun</DialogTitle>
            <DialogDescription>
              A local, display-only timeline. No telemetry and no leaderboard.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {!optedIn ? (
              <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
                <p className="font-medium">Fork Speedrun is off</p>
                <p className="mt-1 text-muted-foreground">
                  Opt in to derive a timeline from this project's local creation receipt and Git
                  history. Nothing is uploaded or published.
                </p>
                <Button className="mt-3" onClick={() => updateOptIn(true)}>
                  Show my local timeline
                </Button>
              </div>
            ) : speedrunQuery.isPending ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
                Reading local milestone receipts…
              </div>
            ) : speedrunQuery.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Unable to read speedrun receipts</p>
                <p className="mt-1 text-muted-foreground">
                  {speedrunQuery.error instanceof Error
                    ? speedrunQuery.error.message
                    : "An unknown error occurred."}
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => void speedrunQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : speedrunQuery.data ? (
              <ForkSpeedrunReport result={speedrunQuery.data} />
            ) : null}
            {optedIn ? (
              <Button className="mt-4" variant="ghost" size="sm" onClick={() => updateOptIn(false)}>
                Turn off Fork Speedrun
              </Button>
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </EnvironmentLabeledSection>
  );
}
