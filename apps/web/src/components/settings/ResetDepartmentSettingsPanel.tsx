// FILE: ResetDepartmentSettingsPanel.tsx
// Purpose: Non-operational Reset Department shell and accessible risk-tier menu.
// Layer: Settings UI component

import { useState } from "react";

import { cn } from "~/lib/utils";
import { settingRowAnchorId } from "~/settingsNavigation";

import { Button } from "../ui/button";
import { SettingsSectionShell } from "./SettingsPanelPrimitives";
import { selectResetOracleResponse } from "./resetOracle";

export const RESET_DEPARTMENT_ACTIONS = [
  {
    id: "oracle",
    icon: "🎱",
    title: "Ask the Reset Oracle",
    risk: "SAFE",
    description: "Seek dubious wisdom without touching your project, account, or filesystem.",
  },
  {
    id: "dependencies",
    icon: "🧹",
    title: "Delete node_modules",
    risk: "LOW RISK",
    description: "A future cleanup tool for dependencies in the active workspace only.",
  },
  {
    id: "hard-reset",
    icon: "☢️",
    title: "git reset --hard",
    risk: "DANGER",
    description: "A future guarded reset flow. It cannot run from this placeholder.",
  },
  {
    id: "quota",
    icon: "♻️",
    title: "Reset Codex Quota",
    risk: "LOL",
    description: "A fictional quota reset. No provider or account state is connected.",
  },
] as const;

type ResetDepartmentAction = (typeof RESET_DEPARTMENT_ACTIONS)[number];

function placeholderMessage(action: ResetDepartmentAction): string {
  return `${action.title} is coming soon. No reset operation ran.`;
}

export function ResetDepartmentSettingsPanel({
  active,
  random = Math.random,
}: {
  readonly active: boolean;
  readonly random?: () => number;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [oracleResponse, setOracleResponse] = useState<string | null>(null);
  if (!active) return null;

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Sometimes the solution is starting over. Sometimes that&apos;s an absolutely terrible idea.
      </p>

      <SettingsSectionShell title="Choose your level of regret">
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Reset Department actions">
          {RESET_DEPARTMENT_ACTIONS.map((action) => {
            const danger = action.risk === "DANGER";
            const oracle = action.id === "oracle";
            const descriptionId = `reset-department-${action.id}-description`;
            return (
              <article
                id={settingRowAnchorId(action.title)}
                key={action.id}
                data-risk={action.risk}
                className={cn(
                  "flex min-h-52 flex-col rounded-xl border bg-[var(--color-background-elevated-primary-opaque)] p-4",
                  danger && "border-destructive/60 bg-destructive/4",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-2xl" aria-hidden="true">
                    {action.icon}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                      danger
                        ? "border-destructive/50 bg-destructive/8 text-destructive"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {action.risk}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-medium text-foreground">{action.title}</h3>
                <p
                  id={descriptionId}
                  className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground"
                >
                  {action.description}
                </p>
                {oracleResponse && oracle ? (
                  <blockquote className="mt-3 rounded-lg border bg-background/60 px-3 py-2 text-center text-sm font-medium text-foreground">
                    {oracleResponse}
                  </blockquote>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={danger ? "destructive-outline" : "outline"}
                  className="mt-4 w-full"
                  data-reset-placeholder={oracle ? undefined : "true"}
                  data-reset-oracle={oracle ? "true" : undefined}
                  aria-describedby={descriptionId}
                  aria-label={
                    oracle
                      ? `${action.title} — ${action.risk}`
                      : `${action.title} — ${action.risk} placeholder`
                  }
                  onClick={() => {
                    if (oracle) {
                      const result = selectResetOracleResponse(random);
                      setOracleResponse(result.response);
                      setStatus(`The Reset Oracle says: ${result.response}`);
                      return;
                    }
                    setStatus(placeholderMessage(action));
                  }}
                >
                  {oracle ? "Ask Oracle" : "Coming soon"}
                </Button>
              </article>
            );
          })}
        </div>
      </SettingsSectionShell>

      <p className="min-h-5 text-xs text-muted-foreground" role="status" aria-live="polite">
        {status ?? "The Oracle is harmless. Every other control is a non-operational placeholder."}
      </p>
    </div>
  );
}
