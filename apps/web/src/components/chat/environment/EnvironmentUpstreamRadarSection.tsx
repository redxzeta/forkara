// FILE: EnvironmentUpstreamRadarSection.tsx
// Purpose: Cached fork/upstream divergence with an explicit, user-initiated fetch action.
// Layer: Environment panel section

import type { GitUpstreamSyncPreviewResult, GitUpstreamStatusResult } from "@forkara/contracts";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toastManager } from "~/components/ui/toast";
import { gitQueryKeys, gitUpstreamStatusQueryOptions } from "~/lib/gitReactQuery";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  GitForkIcon,
  GitMergeIcon,
  RefreshCwIcon,
} from "~/lib/icons";
import { formatRelativeTime } from "~/lib/relativeTime";
import { cn } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";

import {
  ENVIRONMENT_ROW_CLASS_NAME,
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
  EnvironmentRowBody,
} from "./EnvironmentRow";
import { EnvironmentUpstreamSyncDialog } from "./EnvironmentUpstreamSyncDialog";

function statusIcon(status: GitUpstreamStatusResult) {
  switch (status.state) {
    case "ready":
      return (
        <CircleCheckIcon
          className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-success")}
          aria-hidden
        />
      );
    case "unreachable":
      return (
        <CircleAlertIcon
          className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-destructive")}
          aria-hidden
        />
      );
    case "missing":
    case "stale":
      return <GitForkIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />;
  }
}

function branchLabel(status: GitUpstreamStatusResult): string | null {
  if (!status.localBranch || !status.upstreamBranch) return null;
  return status.localBranch === status.upstreamBranch
    ? status.localBranch
    : `${status.localBranch} → upstream/${status.upstreamBranch}`;
}

function lastFetchedLabel(iso: string | null | undefined): string {
  if (!iso) return "Never fetched";
  const relative = formatRelativeTime(iso);
  return relative === "now" ? "Fetched now" : `Fetched ${relative} ago`;
}

export function EnvironmentUpstreamRadarSection({
  gitCwd,
  enabled,
}: {
  gitCwd: string | null;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncPreview, setSyncPreview] = useState<GitUpstreamSyncPreviewResult | null>(null);
  const statusQuery = useQuery(gitUpstreamStatusQueryOptions(gitCwd, enabled));
  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!gitCwd) throw new Error("Upstream status is unavailable.");
      return ensureNativeApi().git.refreshUpstream({ cwd: gitCwd });
    },
    onSuccess: (status) => {
      queryClient.setQueryData(gitQueryKeys.upstreamStatus(gitCwd), status);
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkHealth(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.attributionGuardian(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkFamilyTree(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.originalityMeter(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkArchaeology(gitCwd),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Unable to refresh upstream",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    },
  });
  const previewSyncMutation = useMutation({
    mutationFn: async () => {
      if (!gitCwd) throw new Error("Upstream sync is unavailable.");
      return ensureNativeApi().git.previewUpstreamSync({ cwd: gitCwd });
    },
    onSuccess: (preview) => {
      setSyncPreview(preview);
      void statusQuery.refetch();
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkHealth(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.attributionGuardian(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkFamilyTree(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.originalityMeter(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkArchaeology(gitCwd),
      });
    },
  });
  const applySyncMutation = useMutation({
    mutationFn: async (preview: GitUpstreamSyncPreviewResult) => {
      if (!gitCwd || !preview.localHead || !preview.upstreamHead) {
        throw new Error("The sync preview is incomplete. Preview again.");
      }
      return ensureNativeApi().git.applyUpstreamSync({
        cwd: gitCwd,
        expectedLocalHead: preview.localHead,
        expectedUpstreamHead: preview.upstreamHead,
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(gitQueryKeys.upstreamStatus(gitCwd), result.upstreamStatus);
      void queryClient.invalidateQueries({ queryKey: gitQueryKeys.status(gitCwd), exact: true });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkHealth(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.attributionGuardian(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkFamilyTree(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.originalityMeter(gitCwd),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: gitQueryKeys.forkArchaeology(gitCwd),
      });
      setSyncDialogOpen(false);
      setSyncPreview(null);
      toastManager.add({
        type: "success",
        title: "Upstream sync applied",
        description: `${result.branch} was fast-forwarded locally. Push separately when ready.`,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Unable to apply upstream sync",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
      setSyncPreview(null);
      previewSyncMutation.mutate();
    },
  });

  const openSyncPreview = () => {
    setSyncPreview(null);
    previewSyncMutation.reset();
    setSyncDialogOpen(true);
    previewSyncMutation.mutate();
  };

  if (!enabled || !gitCwd) return null;

  const status = statusQuery.data;
  const loading = statusQuery.isPending && !status;
  const failed = statusQuery.isError && !status;
  const branches = status ? branchLabel(status) : null;
  const lastFetched = lastFetchedLabel(status?.lastSuccessfulFetchAt);
  const statusRowBody = (
    <EnvironmentRowBody
      icon={
        loading ? (
          <RefreshCwIcon
            className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "animate-spin")}
            aria-hidden
          />
        ) : failed ? (
          <CircleAlertIcon
            className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-destructive")}
            aria-hidden
          />
        ) : status ? (
          statusIcon(status)
        ) : (
          <GitForkIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />
        )
      }
      label={
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate">
            {loading
              ? "Reading cached upstream status…"
              : failed
                ? "Couldn't read upstream status"
                : (status?.message ?? "Upstream status unavailable")}
          </span>
          {branches ? (
            <span className="truncate text-[length:var(--app-font-size-ui-xs,10px)] text-muted-foreground">
              {branches}
            </span>
          ) : null}
        </span>
      }
      trailing={
        status?.hasUpstream && (status.aheadCount > 0 || status.behindCount > 0) ? (
          <span aria-label={`${status.aheadCount} ahead, ${status.behindCount} behind`}>
            +{status.aheadCount} −{status.behindCount}
          </span>
        ) : null
      }
    />
  );

  return (
    <EnvironmentLabeledSection label="Upstream Radar">
      {failed ? (
        <button
          type="button"
          className={ENVIRONMENT_ROW_CLASS_NAME}
          title="Retry reading cached upstream status"
          onClick={() => void statusQuery.refetch()}
        >
          {statusRowBody}
        </button>
      ) : (
        <div className={cn(ENVIRONMENT_ROW_CLASS_NAME, "pointer-events-none cursor-default")}>
          {statusRowBody}
        </div>
      )}

      {status?.hasUpstream ? (
        <EnvironmentRow
          icon={<GitMergeIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
          label="Preview sync"
          disabled={previewSyncMutation.isPending}
          title="Fetch upstream and preview a safe local synchronization"
          onClick={openSyncPreview}
        />
      ) : null}

      {status?.hasUpstream ? (
        <EnvironmentRow
          icon={
            <RefreshCwIcon
              className={cn(
                ENVIRONMENT_ROW_ICON_CLASS_NAME,
                refreshMutation.isPending && "animate-spin",
              )}
              aria-hidden
            />
          }
          label={refreshMutation.isPending ? "Fetching upstream…" : "Refresh upstream"}
          trailing={
            <span className="text-[length:var(--app-font-size-ui-xs,10px)] text-muted-foreground">
              {lastFetched}
            </span>
          }
          disabled={refreshMutation.isPending}
          title="Fetch the upstream default branch and refresh divergence counts"
          onClick={() => refreshMutation.mutate()}
        />
      ) : null}

      <EnvironmentUpstreamSyncDialog
        open={syncDialogOpen}
        preview={syncPreview}
        previewPending={previewSyncMutation.isPending}
        previewError={
          previewSyncMutation.error instanceof Error ? previewSyncMutation.error.message : null
        }
        applyPending={applySyncMutation.isPending}
        onOpenChange={(open) => {
          setSyncDialogOpen(open);
          if (!open) setSyncPreview(null);
        }}
        onRetry={() => previewSyncMutation.mutate()}
        onApply={() => {
          if (syncPreview) applySyncMutation.mutate(syncPreview);
        }}
      />
    </EnvironmentLabeledSection>
  );
}
