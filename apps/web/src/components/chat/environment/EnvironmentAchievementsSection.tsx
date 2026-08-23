// FILE: EnvironmentAchievementsSection.tsx
// Purpose: Minimal local achievement viewer with secret-achievement redaction.
// Layer: Environment panel presentation over the shared achievement engine.

import { useState, useSyncExternalStore } from "react";

import { ACHIEVEMENT_CATALOG, type AchievementId } from "~/achievements/catalog";
import {
  getAchievementSnapshot,
  subscribeToAchievementState,
  type AchievementSnapshot,
} from "~/achievements/engine";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { GiftIcon } from "~/lib/icons";

import {
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
} from "./EnvironmentRow";

export interface AchievementViewerRow {
  readonly id: AchievementId;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly unlockedAt: string | null;
}

export function achievementViewerRows(
  snapshot: AchievementSnapshot,
): readonly AchievementViewerRow[] {
  const unlocks = new Map(snapshot.map((unlock) => [unlock.id, unlock]));
  return ACHIEVEMENT_CATALOG.map((definition) => {
    const unlock = unlocks.get(definition.id);
    const hidden = definition.secret && !unlock;
    return {
      id: definition.id,
      title: hidden ? "Secret achievement" : definition.title,
      description: hidden ? "Hidden until unlocked." : definition.description,
      icon: hidden ? "?" : (definition.icon ?? "🏆"),
      unlockedAt: unlock?.unlockedAt ?? null,
    };
  });
}

export function AchievementViewer({ snapshot }: { snapshot: AchievementSnapshot }) {
  const rows = achievementViewerRows(snapshot);
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3"
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background"
              aria-hidden
            >
              {row.icon}
            </span>
            <div className="min-w-0">
              <p
                className={
                  row.unlockedAt
                    ? "font-medium text-sm"
                    : "font-medium text-muted-foreground text-sm"
                }
              >
                {row.title}
              </p>
              <p className="mt-0.5 text-muted-foreground text-xs">{row.description}</p>
              {row.unlockedAt ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  Unlocked {new Date(row.unlockedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Stored only in this browser. No account sync, network request, or telemetry.
      </p>
    </div>
  );
}

export function EnvironmentAchievementsSection({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const snapshot = useSyncExternalStore(
    subscribeToAchievementState,
    getAchievementSnapshot,
    getAchievementSnapshot,
  );
  if (!enabled) return null;

  return (
    <EnvironmentLabeledSection label="Achievements">
      <EnvironmentRow
        icon={<GiftIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
        label="Local achievements"
        trailing={
          <span className="text-muted-foreground text-xs">
            {snapshot.length}/{ACHIEVEMENT_CATALOG.length}
          </span>
        }
        title="View deterministic achievements stored in this browser"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Local achievements</DialogTitle>
            <DialogDescription>
              Receipts for real Forkara actions, plus a few harmless jokes.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <AchievementViewer snapshot={snapshot} />
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </EnvironmentLabeledSection>
  );
}
