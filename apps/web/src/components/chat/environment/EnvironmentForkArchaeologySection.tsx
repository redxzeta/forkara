// FILE: EnvironmentForkArchaeologySection.tsx
// Purpose: Lazy, paginated fork and selected-file provenance inspection.
// Layer: Environment panel section and dialog

import type {
  GitForkArchaeologyCommit,
  GitForkArchaeologyFileHistoryResult,
  GitForkArchaeologyOverviewResult,
} from "@forkara/contracts";
import { GIT_FORK_ARCHAEOLOGY_DEFAULT_PAGE_SIZE } from "@forkara/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { ensureNativeApi } from "~/nativeApi";
import { GitCommitIcon, HistoryIcon, RefreshCwIcon } from "~/lib/icons";
import { formatRelativeTime } from "~/lib/relativeTime";
import { GIT_EXPENSIVE_READ_RETRY_OPTIONS, gitQueryKeys } from "~/lib/gitReactQuery";

import {
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
} from "./EnvironmentRow";

const PAGE_SIZE = GIT_FORK_ARCHAEOLOGY_DEFAULT_PAGE_SIZE;

function originLabel(origin: GitForkArchaeologyCommit["origin"]): string {
  switch (origin) {
    case "fork":
      return "Fork-only";
    case "upstream":
      return "Upstream-only";
    case "shared":
      return "Shared with upstream";
    case "unknown":
      return "Origin unknown";
  }
}

function CommitReceipt({
  commit,
  onOpenUrl,
}: {
  commit: GitForkArchaeologyCommit;
  onOpenUrl?: (url: string) => void;
}) {
  const relative = formatRelativeTime(commit.authoredAt);
  const upstreamUrl = commit.upstreamUrl;
  return (
    <li className="rounded-lg border border-border/70 bg-muted/20 p-2">
      <div className="flex min-w-0 items-center gap-2">
        {upstreamUrl && onOpenUrl ? (
          <button
            type="button"
            className="shrink-0 font-mono text-link text-xs hover:underline"
            onClick={() => onOpenUrl(upstreamUrl)}
            title="Open exact upstream commit"
          >
            {commit.shortSha}
          </button>
        ) : (
          <code className="shrink-0 text-muted-foreground text-xs">{commit.shortSha}</code>
        )}
        <span className="min-w-0 truncate text-sm">{commit.subject}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-muted-foreground text-xs">
        <span>{originLabel(commit.origin)}</span>
        <span>{commit.authorName}</span>
        <span>{relative === "now" ? "now" : `${relative} ago`}</span>
      </div>
    </li>
  );
}

export function ForkArchaeologyOverviewCard({
  overview,
  onOpenUrl,
}: {
  overview: GitForkArchaeologyOverviewResult;
  onOpenUrl?: (url: string) => void;
}) {
  const mergeBaseUrl = overview.mergeBase?.upstreamUrl;
  return (
    <section aria-labelledby="fork-archaeology-relationship-heading" className="space-y-2">
      <h3 id="fork-archaeology-relationship-heading" className="font-medium text-sm">
        Fork relationship
      </h3>
      <div className="rounded-xl border border-border bg-muted/25 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-sm">
            {overview.state === "ready"
              ? "Exact common ancestry"
              : overview.state === "missing_upstream"
                ? "Upstream unavailable"
                : overview.state === "incomplete_history"
                  ? "History incomplete"
                  : "No common ancestor"}
          </span>
          <span
            className="text-muted-foreground text-xs"
            aria-label={`${overview.forkUniqueCount} fork-only, ${overview.upstreamUniqueCount} upstream-only commits`}
          >
            +{overview.forkUniqueCount} −{overview.upstreamUniqueCount}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground text-sm">{overview.message}</p>
        <p className="mt-2 font-mono text-muted-foreground text-xs">
          {overview.localRef} ↔ {overview.upstreamRef ?? "upstream unknown"}
        </p>
        <div className="mt-2 text-xs">
          <span className="text-muted-foreground">Merge-base: </span>
          {overview.mergeBase && mergeBaseUrl && onOpenUrl ? (
            <button
              type="button"
              className="font-mono text-link hover:underline"
              onClick={() => onOpenUrl(mergeBaseUrl)}
            >
              {overview.mergeBase.shortSha}
            </button>
          ) : overview.mergeBase ? (
            <code>{overview.mergeBase.shortSha}</code>
          ) : (
            <span>Unknown</span>
          )}
        </div>
      </div>
    </section>
  );
}

function CommitPageSection({
  heading,
  count,
  commits,
  loading,
  error,
  hasMore,
  onLoadMore,
  onOpenUrl,
}: {
  heading: string;
  count: number;
  commits: readonly GitForkArchaeologyCommit[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpenUrl: (url: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-sm">{heading}</h3>
        <span className="text-muted-foreground text-xs">{count}</span>
      </div>
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-destructive text-sm">
          {error}
        </p>
      ) : commits.length > 0 ? (
        <ol className="space-y-1.5">
          {commits.map((commit) => (
            <CommitReceipt key={commit.sha} commit={commit} onOpenUrl={onOpenUrl} />
          ))}
        </ol>
      ) : loading ? (
        <p className="text-muted-foreground text-sm">Reading commits…</p>
      ) : (
        <p className="text-muted-foreground text-sm">No unique commits.</p>
      )}
      {hasMore ? (
        <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading…" : "Load 20 more"}
        </Button>
      ) : null}
    </section>
  );
}

export function ForkArchaeologyFileHistory({
  history,
  onOpenUrl,
}: {
  history: GitForkArchaeologyFileHistoryResult;
  onOpenUrl?: (url: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs">{history.path}</p>
      <p className="text-muted-foreground text-xs">{history.message}</p>
      {history.commits.length > 0 ? (
        <ol className="space-y-1.5">
          {history.commits.map((commit) => (
            <CommitReceipt key={commit.sha} commit={commit} {...(onOpenUrl ? { onOpenUrl } : {})} />
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-border bg-muted/20 p-2 text-muted-foreground text-sm">
          Origin unknown: Git has no recorded history for this path.
        </p>
      )}
    </div>
  );
}

function ForkArchaeologyDialog({
  open,
  gitCwd,
  onOpenChange,
}: {
  open: boolean;
  gitCwd: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [draftPath, setDraftPath] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const overviewQuery = useQuery({
    queryKey: [...gitQueryKeys.forkArchaeology(gitCwd), "overview"],
    queryFn: () => ensureNativeApi().git.forkArchaeologyOverview({ cwd: gitCwd }),
    enabled: open,
    staleTime: 30_000,
    ...GIT_EXPENSIVE_READ_RETRY_OPTIONS,
  });
  const canReadCommitSets = open && Boolean(overviewQuery.data?.upstreamRef);
  const forkCommits = useInfiniteQuery({
    queryKey: [...gitQueryKeys.forkArchaeology(gitCwd), "commits", "fork"],
    queryFn: ({ pageParam }) =>
      ensureNativeApi().git.forkArchaeologyCommitPage({
        cwd: gitCwd,
        side: "fork",
        offset: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: canReadCommitSets,
    staleTime: 30_000,
    ...GIT_EXPENSIVE_READ_RETRY_OPTIONS,
  });
  const upstreamCommits = useInfiniteQuery({
    queryKey: [...gitQueryKeys.forkArchaeology(gitCwd), "commits", "upstream"],
    queryFn: ({ pageParam }) =>
      ensureNativeApi().git.forkArchaeologyCommitPage({
        cwd: gitCwd,
        side: "upstream",
        offset: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: canReadCommitSets,
    staleTime: 30_000,
    ...GIT_EXPENSIVE_READ_RETRY_OPTIONS,
  });
  const fileHistory = useInfiniteQuery({
    queryKey: [...gitQueryKeys.forkArchaeology(gitCwd), "file", selectedPath],
    queryFn: ({ pageParam }) => {
      if (!selectedPath) throw new Error("Select a file before reading its history.");
      return ensureNativeApi().git.forkArchaeologyFileHistory({
        cwd: gitCwd,
        path: selectedPath,
        offset: pageParam,
        limit: PAGE_SIZE,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: open && selectedPath !== null,
    staleTime: 30_000,
    ...GIT_EXPENSIVE_READ_RETRY_OPTIONS,
  });
  const openUrl = (url: string) => {
    void ensureNativeApi()
      .shell.openExternal(url)
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Unable to open upstream commit",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
      });
  };
  const onSubmitPath = (event: FormEvent) => {
    event.preventDefault();
    const path = draftPath.trim();
    if (!path) return;
    if (path === selectedPath) void fileHistory.refetch();
    else setSelectedPath(path);
  };
  const forkCommitList = forkCommits.data?.pages.flatMap((page) => page.commits) ?? [];
  const upstreamCommitList = upstreamCommits.data?.pages.flatMap((page) => page.commits) ?? [];
  const fileHistoryPages = fileHistory.data?.pages ?? [];
  const mergedFileHistory = fileHistoryPages[0]
    ? {
        ...fileHistoryPages[0],
        commits: fileHistoryPages.flatMap((page) => page.commits),
        nextOffset: fileHistoryPages.at(-1)?.nextOffset ?? null,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fork Archaeology</DialogTitle>
          <DialogDescription>
            Inspect exact Git ancestry. No authorship or rewritten-history guesses are made.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          {overviewQuery.isPending ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
              <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
              Reading local provenance…
            </div>
          ) : overviewQuery.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">Unable to inspect provenance</p>
              <p className="mt-1 text-muted-foreground">
                {overviewQuery.error instanceof Error
                  ? overviewQuery.error.message
                  : "An unknown error occurred."}
              </p>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => void overviewQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : overviewQuery.data ? (
            <>
              <ForkArchaeologyOverviewCard overview={overviewQuery.data} onOpenUrl={openUrl} />
              {overviewQuery.data.upstreamRef ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <CommitPageSection
                    heading="Fork-only commits"
                    count={overviewQuery.data.forkUniqueCount}
                    commits={forkCommitList}
                    loading={forkCommits.isFetching}
                    error={
                      forkCommits.isError
                        ? forkCommits.error instanceof Error
                          ? forkCommits.error.message
                          : "Unable to read fork-only commits."
                        : null
                    }
                    hasMore={forkCommits.hasNextPage}
                    onLoadMore={() => void forkCommits.fetchNextPage()}
                    onOpenUrl={openUrl}
                  />
                  <CommitPageSection
                    heading="Upstream-only commits"
                    count={overviewQuery.data.upstreamUniqueCount}
                    commits={upstreamCommitList}
                    loading={upstreamCommits.isFetching}
                    error={
                      upstreamCommits.isError
                        ? upstreamCommits.error instanceof Error
                          ? upstreamCommits.error.message
                          : "Unable to read upstream-only commits."
                        : null
                    }
                    hasMore={upstreamCommits.hasNextPage}
                    onLoadMore={() => void upstreamCommits.fetchNextPage()}
                    onOpenUrl={openUrl}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          <section className="space-y-2" aria-labelledby="fork-archaeology-file-heading">
            <h3 id="fork-archaeology-file-heading" className="font-medium text-sm">
              Selected-file history
            </h3>
            <form className="flex gap-2" onSubmit={onSubmitPath}>
              <Input
                value={draftPath}
                onChange={(event) => setDraftPath(event.target.value)}
                placeholder="Repository-relative path, e.g. src/App.tsx"
                aria-label="Repository-relative file path"
              />
              <Button type="submit" size="sm" disabled={!draftPath.trim()}>
                Inspect
              </Button>
            </form>
            {fileHistory.isError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-destructive text-sm">
                {fileHistory.error instanceof Error
                  ? fileHistory.error.message
                  : "Unable to read file history."}
              </p>
            ) : mergedFileHistory ? (
              <>
                <ForkArchaeologyFileHistory history={mergedFileHistory} onOpenUrl={openUrl} />
                {fileHistory.hasNextPage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={fileHistory.isFetchingNextPage}
                    onClick={() => void fileHistory.fetchNextPage()}
                  >
                    {fileHistory.isFetchingNextPage ? "Loading…" : "Load 20 more"}
                  </Button>
                ) : null}
              </>
            ) : fileHistory.isFetching ? (
              <p className="text-muted-foreground text-sm">Reading file history…</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                History is loaded only after you select a path.
              </p>
            )}
          </section>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

export function EnvironmentForkArchaeologySection({
  gitCwd,
  enabled,
}: {
  gitCwd: string | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!enabled || !gitCwd) return null;

  return (
    <EnvironmentLabeledSection label="Provenance">
      <EnvironmentRow
        icon={<HistoryIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
        label="Fork Archaeology"
        trailing={<GitCommitIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
        title="Inspect merge-base, unique commits, and selected-file history"
        onClick={() => setOpen(true)}
      />
      <ForkArchaeologyDialog open={open} gitCwd={gitCwd} onOpenChange={setOpen} />
    </EnvironmentLabeledSection>
  );
}
