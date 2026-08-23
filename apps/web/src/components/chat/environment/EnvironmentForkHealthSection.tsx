// FILE: EnvironmentForkHealthSection.tsx
// Purpose: Factual fork health summary derived from cached upstream and local Git signals.
// Layer: Environment panel section

import type { GitForkHealthResult } from "@forkara/contracts";
import { useQuery } from "@tanstack/react-query";

import { gitForkHealthQueryOptions } from "~/lib/gitReactQuery";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleQuestionIcon,
  GitMergeConflictIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "~/lib/icons";
import { formatRelativeTime } from "~/lib/relativeTime";
import { cn } from "~/lib/utils";

import {
  ENVIRONMENT_ROW_CLASS_NAME,
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRowBody,
} from "./EnvironmentRow";

function healthIcon(health: GitForkHealthResult) {
  switch (health.state) {
    case "healthy":
      return (
        <CircleCheckIcon
          className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-success")}
          aria-hidden
        />
      );
    case "conflicts":
      return (
        <GitMergeConflictIcon
          className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-destructive")}
          aria-hidden
        />
      );
    case "upstream_unavailable":
      return (
        <CircleAlertIcon
          className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-destructive")}
          aria-hidden
        />
      );
    case "needs_sync":
    case "diverged":
    case "local_changes":
    case "attribution_warning":
      return (
        <TriangleAlertIcon
          className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-warning")}
          aria-hidden
        />
      );
    case "unknown":
      return <CircleQuestionIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />;
  }
}

function lastFetchLabel(value: string | null): string {
  if (!value) return "Last successful fetch: Unknown";
  const relative = formatRelativeTime(value);
  return relative === "now"
    ? "Last successful fetch: Now"
    : `Last successful fetch: ${relative} ago`;
}

export function ForkHealthSummary({ health }: { health: GitForkHealthResult }) {
  const divergenceVisible = health.upstream.aheadCount > 0 || health.upstream.behindCount > 0;
  return (
    <div
      className={cn(ENVIRONMENT_ROW_CLASS_NAME, "pointer-events-none cursor-default items-start")}
    >
      <EnvironmentRowBody
        icon={healthIcon(health)}
        label={
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-medium">{health.label}</span>
            <span className="whitespace-normal text-muted-foreground text-xs leading-snug">
              {health.summary}
            </span>
            <ul className="space-y-0.5 whitespace-normal text-[length:var(--app-font-size-ui-xs,10px)] text-muted-foreground/90 leading-snug">
              {health.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
              <li>• {lastFetchLabel(health.upstream.lastSuccessfulFetchAt)}</li>
            </ul>
          </span>
        }
        trailing={
          divergenceVisible ? (
            <span
              className="text-muted-foreground text-xs"
              aria-label={`${health.upstream.aheadCount} ahead, ${health.upstream.behindCount} behind`}
            >
              +{health.upstream.aheadCount} −{health.upstream.behindCount}
            </span>
          ) : null
        }
      />
    </div>
  );
}

export function EnvironmentForkHealthSection({
  gitCwd,
  enabled,
}: {
  gitCwd: string | null;
  enabled: boolean;
}) {
  const healthQuery = useQuery(gitForkHealthQueryOptions(gitCwd, enabled));
  if (!enabled || !gitCwd) return null;

  return (
    <EnvironmentLabeledSection label="Fork Health">
      {healthQuery.data ? (
        <ForkHealthSummary health={healthQuery.data} />
      ) : healthQuery.isError ? (
        <button
          type="button"
          className={ENVIRONMENT_ROW_CLASS_NAME}
          onClick={() => void healthQuery.refetch()}
          title="Retry reading cached and local fork health"
        >
          <EnvironmentRowBody
            icon={
              <CircleAlertIcon
                className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-destructive")}
                aria-hidden
              />
            }
            label="Couldn't read fork health"
          />
        </button>
      ) : (
        <div className={cn(ENVIRONMENT_ROW_CLASS_NAME, "pointer-events-none cursor-default")}>
          <EnvironmentRowBody
            icon={
              <RefreshCwIcon
                className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "animate-spin")}
                aria-hidden
              />
            }
            label="Reading cached fork health…"
          />
        </div>
      )}
    </EnvironmentLabeledSection>
  );
}
