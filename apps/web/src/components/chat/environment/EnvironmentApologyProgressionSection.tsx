// FILE: EnvironmentApologyProgressionSection.tsx
// Purpose: Local, resettable presentation of the satirical apology ladder.
// Layer: Environment panel parody UI; never publishes or edits repository state.

import type { ProjectId } from "@forkara/contracts";
import { useEffect, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { toastManager } from "~/components/ui/toast";
import {
  APOLOGY_PROGRESSION_STAGES,
  FINAL_APOLOGY_STAGE_INDEX,
  clampApologyStageIndex,
  nextApologyStageIndex,
  readApologyStageIndex,
  writeApologyStageIndex,
} from "~/lib/apologyProgression";
import { MessageCircleIcon, RotateCcwIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { recordAchievementEvent } from "~/achievements/engine";

import {
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
} from "./EnvironmentRow";

export function ApologyProgressionReport({ stageIndex }: { stageIndex: number }) {
  const normalizedStageIndex = clampApologyStageIndex(stageIndex);
  const currentStage =
    APOLOGY_PROGRESSION_STAGES[normalizedStageIndex] ?? APOLOGY_PROGRESSION_STAGES[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">Satire</Badge>
        <Badge variant="outline">Local only</Badge>
        <span className="text-muted-foreground text-xs">
          Stage {normalizedStageIndex + 1} of {APOLOGY_PROGRESSION_STAGES.length}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4" aria-live="polite">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Current satirical stage
        </p>
        <h3 className="mt-1 font-semibold text-base">{currentStage.title}</h3>
        <p className="mt-2 text-muted-foreground text-sm">{currentStage.copy}</p>
      </div>

      <ol aria-label="Satirical apology progression" className="space-y-2">
        {APOLOGY_PROGRESSION_STAGES.map((stage, index) => {
          const current = index === normalizedStageIndex;
          const completed = index < normalizedStageIndex;
          return (
            <li
              key={stage.id}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                current ? "border-warning/40 bg-warning/5" : "border-border/70 bg-background/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
                  current
                    ? "border-warning/60 text-warning"
                    : completed
                      ? "border-success/50 text-success"
                      : "border-border text-muted-foreground",
                )}
              >
                {completed ? "✓" : index + 1}
              </span>
              <span className={cn(current && "font-medium")}>{stage.title}</span>
              <span className="sr-only">
                {current ? "Current satirical stage" : completed ? "Completed" : "Not reached"}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg border border-dashed border-border p-3 text-muted-foreground text-xs">
        This is a private UI joke. Nothing is sent to GitHub, social media, another person, or the
        repository. No person is named or impersonated.
      </div>
    </div>
  );
}

export function EnvironmentApologyProgressionSection({
  projectId,
  enabled,
}: {
  projectId: ProjectId | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [stageIndex, setStageIndex] = useState(() =>
    projectId && typeof localStorage !== "undefined"
      ? readApologyStageIndex(projectId, localStorage)
      : 0,
  );
  useEffect(() => {
    recordAchievementEvent({ type: "apology.stage_reached", stageIndex });
  }, [stageIndex]);
  if (!enabled || !projectId) return null;

  const updateStage = (nextStageIndex: number) => {
    const persisted =
      typeof localStorage !== "undefined" &&
      writeApologyStageIndex(projectId, nextStageIndex, localStorage);
    if (!persisted) {
      toastManager.add({
        type: "warning",
        title: "Local progress could not be saved",
        description: "The apology bit will stay at this stage only for the current session.",
      });
    }
    setStageIndex(nextStageIndex);
  };

  return (
    <EnvironmentLabeledSection label="Fork Lore">
      <EnvironmentRow
        icon={<MessageCircleIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
        label="Apology Progression"
        trailing={
          <span className="text-muted-foreground text-xs">
            {stageIndex + 1}/{APOLOGY_PROGRESSION_STAGES.length}
          </span>
        }
        title="Open a local, satirical apology progression"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apology Progression</DialogTitle>
            <DialogDescription>
              Six entirely local stages from denial to acknowledgement. Satire, not a publisher.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <ApologyProgressionReport stageIndex={stageIndex} />
            <div className="mt-4 flex flex-wrap gap-2">
              {stageIndex < FINAL_APOLOGY_STAGE_INDEX ? (
                <Button onClick={() => updateStage(nextApologyStageIndex(stageIndex))}>
                  Proceed to next stage
                </Button>
              ) : null}
              <Button variant="ghost" disabled={stageIndex === 0} onClick={() => updateStage(0)}>
                <RotateCcwIcon aria-hidden />
                Reset progression
              </Button>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </EnvironmentLabeledSection>
  );
}
