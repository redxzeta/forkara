// FILE: EnvironmentForkFamilyTreeSection.tsx
// Purpose: Compact, keyboard-accessible direct fork ancestry visualization.
// Layer: Environment panel section and details dialog

import type { GitForkFamilyTreeNode, GitForkFamilyTreeResult } from "@forkara/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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
import { ensureNativeApi } from "~/nativeApi";
import { GitBranchIcon, GitForkIcon, RefreshCwIcon } from "~/lib/icons";
import { formatRelativeTime } from "~/lib/relativeTime";
import { GIT_EXPENSIVE_READ_RETRY_OPTIONS, gitQueryKeys } from "~/lib/gitReactQuery";
import { recordAchievementEvent } from "~/achievements/engine";

import {
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
} from "./EnvironmentRow";

function roleLabel(role: GitForkFamilyTreeNode["role"]): string {
  switch (role) {
    case "current":
      return "Current repository";
    case "upstream":
      return "Configured upstream";
    case "github_parent":
      return "GitHub parent";
  }
}

function NodeCard({
  node,
  onOpenUrl,
}: {
  node: GitForkFamilyTreeNode;
  onOpenUrl?: (url: string) => void;
}) {
  const activity = node.lastActivityAt ? formatRelativeTime(node.lastActivityAt) : null;
  const divergenceVisible = node.aheadCount !== null && node.behindCount !== null;
  const repositoryUrl = node.repositoryUrl;
  return (
    <li>
      <article className="rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{roleLabel(node.role)}</p>
            {repositoryUrl && onOpenUrl ? (
              <button
                type="button"
                className="mt-0.5 max-w-full break-all text-left font-medium text-link text-sm hover:underline"
                onClick={() => onOpenUrl(repositoryUrl)}
              >
                {node.name}
              </button>
            ) : (
              <p className="mt-0.5 break-all font-medium text-sm">{node.name}</p>
            )}
          </div>
          {node.role === "current" ? (
            <GitForkIcon className="size-4 shrink-0" aria-hidden />
          ) : (
            <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div>
            <dt className="text-muted-foreground">Branch</dt>
            <dd>{node.defaultBranch ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last activity</dt>
            <dd>{activity ? (activity === "now" ? "Now" : `${activity} ago`) : "Unknown"}</dd>
          </div>
          {divergenceVisible ? (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Relative divergence</dt>
              <dd aria-label={`${node.aheadCount} ahead, ${node.behindCount} behind`}>
                +{node.aheadCount} −{node.behindCount}
              </dd>
            </div>
          ) : null}
        </dl>
      </article>
    </li>
  );
}

export function ForkFamilyTreeReport({
  tree,
  onOpenUrl,
}: {
  tree: GitForkFamilyTreeResult;
  onOpenUrl?: (url: string) => void;
}) {
  const nodes = tree.nodes.toSorted((left, right) => {
    const order = { github_parent: 0, upstream: 1, current: 2 } as const;
    return order[left.role] - order[right.role];
  });
  const ancestors = nodes.filter((node) => node.role !== "current");
  const current = nodes.find((node) => node.role === "current") ?? null;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {tree.metadataState === "complete"
            ? "Local + GitHub metadata"
            : tree.metadataState === "partial"
              ? "Partial metadata"
              : "Local-only mode"}
        </p>
        <p className="mt-1 text-sm">{tree.message}</p>
      </div>
      <section
        aria-label="Direct repository ancestry"
        tabIndex={0}
        className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ancestors.length > 0 ? (
          <>
            <p className="mb-2 text-muted-foreground text-xs">Known direct sources</p>
            <ol className="space-y-2">
              {ancestors.map((node) => (
                <NodeCard key={node.id} node={node} {...(onOpenUrl ? { onOpenUrl } : {})} />
              ))}
            </ol>
            <div className="flex items-center gap-2 py-2 text-muted-foreground text-xs" aria-hidden>
              <span className="h-5 border-border border-l" />
              <span>direct ancestry</span>
            </div>
          </>
        ) : null}
        {current ? (
          <ol>
            <NodeCard node={current} {...(onOpenUrl ? { onOpenUrl } : {})} />
          </ol>
        ) : null}
      </section>
      <p className="text-muted-foreground text-xs">
        Forkara shows only configured upstream and direct GitHub parent metadata. It does not crawl
        the wider fork network.
      </p>
    </div>
  );
}

export function EnvironmentForkFamilyTreeSection({
  gitCwd,
  enabled,
}: {
  gitCwd: string | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const treeQuery = useQuery({
    queryKey: gitQueryKeys.forkFamilyTree(gitCwd),
    queryFn: () => {
      if (!gitCwd) throw new Error("A repository is required.");
      return ensureNativeApi().git.forkFamilyTree({ cwd: gitCwd });
    },
    enabled: enabled && open && gitCwd !== null,
    staleTime: 60_000,
    ...GIT_EXPENSIVE_READ_RETRY_OPTIONS,
  });
  useEffect(() => {
    if (treeQuery.data) {
      recordAchievementEvent({
        type: "fork_family_tree.viewed",
        knownGenerationCount: treeQuery.data.nodes.length,
      });
    }
  }, [treeQuery.data]);
  if (!enabled || !gitCwd) return null;

  const openUrl = (url: string) => {
    void ensureNativeApi()
      .shell.openExternal(url)
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Unable to open repository",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
      });
  };

  return (
    <EnvironmentLabeledSection label="Ancestry">
      <EnvironmentRow
        icon={<GitForkIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
        label="Fork Family Tree"
        trailing={
          treeQuery.isFetching ? (
            <RefreshCwIcon className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : null
        }
        title="Show direct upstream and GitHub parent ancestry"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fork Family Tree</DialogTitle>
            <DialogDescription>
              Direct ancestry from known remotes and one bounded GitHub metadata lookup.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {treeQuery.isPending ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
                Reading direct ancestry…
              </div>
            ) : treeQuery.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Unable to read ancestry</p>
                <p className="mt-1 text-muted-foreground">
                  {treeQuery.error instanceof Error
                    ? treeQuery.error.message
                    : "An unknown error occurred."}
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => void treeQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : treeQuery.data ? (
              <ForkFamilyTreeReport tree={treeQuery.data} onOpenUrl={openUrl} />
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </EnvironmentLabeledSection>
  );
}
