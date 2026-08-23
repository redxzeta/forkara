// FILE: EnvironmentAttributionGuardianSection.tsx
// Purpose: Read-only license and notice comparison against the cached upstream branch.
// Layer: Environment panel section and details dialog

import type { GitAttributionGuardianFile, GitAttributionGuardianResult } from "@forkara/contracts";
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
import { ensureNativeApi } from "~/nativeApi";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  FileIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { GIT_EXPENSIVE_READ_RETRY_OPTIONS, gitQueryKeys } from "~/lib/gitReactQuery";

import {
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
} from "./EnvironmentRow";

function changeLabel(file: GitAttributionGuardianFile): string {
  switch (file.change) {
    case "added":
      return "Added in fork";
    case "deleted":
      return "Deleted from fork";
    case "modified":
      return "Modified in fork";
    case "unchanged":
      return "Unchanged";
  }
}

function GuardianFile({ file }: { file: GitAttributionGuardianFile }) {
  return (
    <li
      className={cn(
        "rounded-xl border p-3",
        file.warning ? "border-warning/35 bg-warning/5" : "border-border bg-muted/20",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-all font-mono text-xs">{file.path}</p>
          <p className="mt-1 text-muted-foreground text-sm">{file.summary}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-xs",
            file.warning ? "border-warning/40 text-warning" : "border-border text-muted-foreground",
          )}
        >
          {changeLabel(file)}
        </span>
      </div>
      {file.diff !== null ? (
        <div className="mt-3">
          <p className="mb-1 text-muted-foreground text-xs">Patch</p>
          <pre className="max-h-72 overflow-auto rounded-lg border border-border/70 bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
            {file.diff || "Git reported a changed file without textual patch output."}
          </pre>
          {file.diffTruncated ? (
            <p className="mt-1 text-muted-foreground text-xs">
              Patch preview truncated; inspect the file in Git for the complete change.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function AttributionGuardianReport({ report }: { report: GitAttributionGuardianResult }) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-xl border p-3",
          report.warningCount > 0 || report.state !== "ready"
            ? "border-warning/35 bg-warning/5"
            : "border-border bg-muted/20",
        )}
      >
        <div className="flex items-center gap-2">
          {report.warningCount > 0 ? (
            <TriangleAlertIcon className="size-4 shrink-0 text-warning" aria-hidden />
          ) : report.state !== "ready" ? (
            <CircleAlertIcon className="size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <CircleCheckIcon className="size-4 shrink-0 text-success" aria-hidden />
          )}
          <p className="font-medium text-sm">
            {report.state === "ready"
              ? report.warningCount > 0
                ? `${report.warningCount} ${report.warningCount === 1 ? "change" : "changes"} to review`
                : "No attribution regression found"
              : report.state === "missing_upstream"
                ? "Upstream unavailable"
                : "History incomplete"}
          </p>
        </div>
        <p className="mt-1 text-muted-foreground text-sm">{report.message}</p>
        <p className="mt-2 font-mono text-muted-foreground text-xs">
          {report.localRef} ↔ {report.upstreamRef ?? "upstream unknown"}
        </p>
      </div>

      <p className="rounded-lg border border-border/70 bg-muted/20 p-2 text-muted-foreground text-xs">
        Attribution Guardian reports Git differences for review. It does not decide whether a change
        is lawful and does not provide legal advice.
      </p>

      {report.files.length > 0 ? (
        <ol className="space-y-2">
          {report.files.map((file) => (
            <GuardianFile key={file.path} file={file} />
          ))}
        </ol>
      ) : report.state === "ready" ? (
        <p className="text-muted-foreground text-sm">No recognized attribution files.</p>
      ) : null}
    </div>
  );
}

export function EnvironmentAttributionGuardianSection({
  gitCwd,
  enabled,
}: {
  gitCwd: string | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reportQuery = useQuery({
    queryKey: gitQueryKeys.attributionGuardian(gitCwd),
    queryFn: () => {
      if (!gitCwd) throw new Error("A repository is required.");
      return ensureNativeApi().git.attributionGuardian({ cwd: gitCwd });
    },
    enabled: enabled && open && gitCwd !== null,
    staleTime: 30_000,
    ...GIT_EXPENSIVE_READ_RETRY_OPTIONS,
  });
  if (!enabled || !gitCwd) return null;

  const trailing = reportQuery.data
    ? reportQuery.data.warningCount > 0
      ? `${reportQuery.data.warningCount} warning${reportQuery.data.warningCount === 1 ? "" : "s"}`
      : "Clear"
    : reportQuery.isFetching
      ? "Reading…"
      : "Review";

  return (
    <EnvironmentLabeledSection label="Attribution">
      <EnvironmentRow
        icon={
          reportQuery.data?.warningCount ? (
            <TriangleAlertIcon
              className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "text-warning")}
              aria-hidden
            />
          ) : reportQuery.isFetching ? (
            <RefreshCwIcon
              className={cn(ENVIRONMENT_ROW_ICON_CLASS_NAME, "animate-spin")}
              aria-hidden
            />
          ) : (
            <FileIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />
          )
        }
        label="Attribution Guardian"
        trailing={<span className="text-muted-foreground text-xs">{trailing}</span>}
        title="Compare license and notice files with cached upstream"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Attribution Guardian</DialogTitle>
            <DialogDescription>
              Review factual license, notice, copying, and copyright file differences.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {reportQuery.isPending ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
                Comparing exact Git refs…
              </div>
            ) : reportQuery.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Unable to compare attribution files</p>
                <p className="mt-1 text-muted-foreground">
                  {reportQuery.error instanceof Error
                    ? reportQuery.error.message
                    : "An unknown error occurred."}
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => void reportQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : reportQuery.data ? (
              <AttributionGuardianReport report={reportQuery.data} />
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </EnvironmentLabeledSection>
  );
}
