// FILE: EnvironmentUpstreamSyncDialog.tsx
// Purpose: Review-only upstream sync preview and guarded local fast-forward confirmation.
// Layer: Environment panel dialog

import type { GitUpstreamSyncPreviewResult } from "@forkara/contracts";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { RefreshCwIcon } from "~/lib/icons";

function stateLabel(state: GitUpstreamSyncPreviewResult["state"]): string {
  switch (state) {
    case "missing":
      return "Upstream unavailable";
    case "unreachable":
      return "Fetch failed";
    case "detached":
      return "Detached HEAD";
    case "branch_mismatch":
      return "Different branch checked out";
    case "conflicts":
      return "Conflicts detected";
    case "dirty":
      return "Working tree has changes";
    case "up_to_date":
      return "Up to date";
    case "local_ahead":
      return "Local branch is ahead";
    case "diverged":
      return "Branches have diverged";
    case "fast_forward":
      return "Fast-forward available";
  }
}

export function UpstreamSyncPreviewContent({ preview }: { preview: GitUpstreamSyncPreviewResult }) {
  const branchMapping =
    preview.localBranch && preview.upstreamBranch
      ? `${preview.localBranch} ← upstream/${preview.upstreamBranch}`
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/25 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-sm">{stateLabel(preview.state)}</span>
          <span className="text-muted-foreground text-xs">
            +{preview.aheadCount} −{preview.behindCount}
          </span>
        </div>
        {branchMapping ? (
          <p className="mt-1 font-mono text-muted-foreground text-xs">{branchMapping}</p>
        ) : null}
        <p className="mt-2 text-muted-foreground text-sm">{preview.message}</p>
      </div>

      {preview.incomingCommits.length > 0 ? (
        <section aria-labelledby="upstream-sync-incoming-heading">
          <h3 id="upstream-sync-incoming-heading" className="mb-2 font-medium text-sm">
            Incoming commits
          </h3>
          <ol className="space-y-2">
            {preview.incomingCommits.map((commit) => (
              <li key={commit.sha} className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
                <code className="text-muted-foreground text-xs">{commit.shortSha}</code>
                <span className="min-w-0 truncate">{commit.subject}</span>
                <span className="col-start-2 text-muted-foreground text-xs">
                  {commit.authorName}
                </span>
              </li>
            ))}
          </ol>
          {preview.incomingCommitsTruncated ? (
            <p className="mt-2 text-muted-foreground text-xs">Showing the first 20 commits.</p>
          ) : null}
        </section>
      ) : null}

      {preview.conflictFiles.length > 0 ? (
        <section aria-labelledby="upstream-sync-conflicts-heading">
          <h3 id="upstream-sync-conflicts-heading" className="mb-2 font-medium text-sm">
            Conflicting files
          </h3>
          <ul className="space-y-1 font-mono text-destructive text-xs">
            {preview.conflictFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Previewing may fetch upstream. Applying only fast-forwards the checked-out local branch; it
        never pushes or force-pushes.
      </p>
    </div>
  );
}

export function EnvironmentUpstreamSyncDialog({
  open,
  preview,
  previewPending,
  previewError,
  applyPending,
  onOpenChange,
  onRetry,
  onApply,
}: {
  open: boolean;
  preview: GitUpstreamSyncPreviewResult | null;
  previewPending: boolean;
  previewError: string | null;
  applyPending: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onApply: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !applyPending && onOpenChange(nextOpen)}>
      <DialogPopup className="max-w-xl" showCloseButton={!applyPending}>
        <DialogHeader>
          <DialogTitle>Preview upstream sync</DialogTitle>
          <DialogDescription>
            Review the fetched upstream changes before modifying the current branch.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          {previewPending ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
              <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
              Fetching upstream and building preview…
            </div>
          ) : previewError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">Unable to preview sync</p>
              <p className="mt-1 text-muted-foreground">{previewError}</p>
            </div>
          ) : preview ? (
            <UpstreamSyncPreviewContent preview={preview} />
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={applyPending}
          >
            Cancel
          </Button>
          {previewError ? (
            <Button size="sm" onClick={onRetry} disabled={previewPending}>
              Retry preview
            </Button>
          ) : preview?.canApply ? (
            <Button size="sm" onClick={onApply} disabled={applyPending}>
              {applyPending ? "Fast-forwarding…" : "Fast-forward local branch"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
