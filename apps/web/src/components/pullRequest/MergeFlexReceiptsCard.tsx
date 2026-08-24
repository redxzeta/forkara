// FILE: MergeFlexReceiptsCard.tsx
// Purpose: Factual authored-PR receipts for the user's explicit local calendar day.
// Layer: Pull request presentation backed by the existing GitHub CLI RPC.

import type {
  MergeFlexReceipt,
  MergeFlexReceiptsInput,
  MergeFlexReceiptsResult,
} from "@forkara/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { Skeleton } from "~/components/ui/skeleton";
import { ExternalLinkIcon, GitPullRequestIcon, RefreshCwIcon } from "~/lib/icons";
import { localCalendarDayRange } from "~/lib/localCalendarDay";
import { pullRequestsMergedTodayQueryOptions } from "~/lib/pullRequestReactQuery";
import { cn } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";
import { PullRequestFilterPillGroup } from "./PullRequestListFilters";
import { isPullRequestsUnavailableError } from "./PullRequestsUnavailableState";
import {
  PR_BODY_TEXT_CLASS_NAME,
  PR_FINE_TEXT_CLASS_NAME,
  PR_META_TEXT_CLASS_NAME,
  PR_QUIET_INK_CLASS_NAME,
} from "./pullRequestText";
import { FactualMergeFlexComposer } from "./MergeFlexComposerDialog";

type MergeFlexScopeChoice = "all" | "repository";

function receiptVisibilityLabel(receipt: MergeFlexReceipt): string | null {
  switch (receipt.repositoryVisibility) {
    case "public":
      return null;
    case "private":
      return "Private";
    case "internal":
      return "Internal";
    case "unknown":
      return "Visibility unknown";
  }
}

function formatMergedTime(mergedAt: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(mergedAt),
  );
}

function mergeFlexErrorCopy(error: unknown): { readonly title: string; readonly detail: string } {
  if (isPullRequestsUnavailableError(error)) {
    if (error.reason === "gh-not-installed") {
      return {
        title: "GitHub CLI is required",
        detail: "Install gh to load factual merged-PR receipts.",
      };
    }
    if (error.reason === "gh-not-authenticated") {
      return {
        title: "Sign in to GitHub CLI",
        detail: "Run gh auth login, then retry. No zero has been assumed.",
      };
    }
  }
  return {
    title: "Receipts are unavailable",
    detail:
      error instanceof Error
        ? error.message
        : "GitHub could not verify today's merged pull requests.",
  };
}

export function MergeFlexReceiptsContent({
  result,
  receiptsOpen,
  onReceiptsOpenChange,
  onFlexOnX,
}: {
  result: MergeFlexReceiptsResult;
  receiptsOpen: boolean;
  onReceiptsOpenChange: (open: boolean) => void;
  onFlexOnX?: () => void;
}) {
  const countLabel = result.incomplete ? `${result.count}+` : String(result.count);
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div aria-live="polite" className="flex items-baseline gap-2">
            <span className="font-heading text-3xl font-semibold tabular-nums">{countLabel}</span>
            <span className={cn(PR_META_TEXT_CLASS_NAME, "text-muted-foreground")}>
              {result.count === 1 ? "pull request" : "pull requests"}
            </span>
          </div>
          <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME, "mt-1")}>
            Authored by @{result.viewer} and merged on {result.date} ·{" "}
            {result.scope.type === "all" ? "all visible repositories" : result.scope.repository}
          </p>
        </div>
        {result.count > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {onFlexOnX ? (
              <Button size="sm" variant="outline" onClick={onFlexOnX}>
                Flex on X
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={receiptsOpen}
              onClick={() => onReceiptsOpenChange(!receiptsOpen)}
            >
              Receipts
              <DisclosureChevron open={receiptsOpen} />
            </Button>
          </div>
        ) : null}
      </div>

      {result.count === 0 ? (
        <p className={cn(PR_META_TEXT_CLASS_NAME, "mt-3 text-muted-foreground")}>
          No pull requests authored by @{result.viewer} were merged in this scope on {result.date}.
        </p>
      ) : null}

      <DisclosureRegion open={receiptsOpen && result.count > 0} className="mt-2">
        <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
          {result.receipts.map((receipt) => {
            const visibilityLabel = receiptVisibilityLabel(receipt);
            return (
              <li key={receipt.url}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-background-elevated-secondary)]"
                  onClick={() => void ensureNativeApi().shell.openExternal(receipt.url)}
                >
                  <GitPullRequestIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className={cn(PR_BODY_TEXT_CLASS_NAME, "block truncate font-medium")}>
                      {receipt.title}
                    </span>
                    <span
                      className={cn(
                        PR_FINE_TEXT_CLASS_NAME,
                        PR_QUIET_INK_CLASS_NAME,
                        "mt-0.5 flex min-w-0 items-center gap-1.5",
                      )}
                    >
                      <span className="truncate">
                        {receipt.repository}#{receipt.number}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">{formatMergedTime(receipt.mergedAt)}</span>
                      {visibilityLabel ? (
                        <span className="shrink-0 rounded border border-border/70 px-1 py-0.5">
                          {visibilityLabel}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
        {result.incomplete ? (
          <p className={cn(PR_FINE_TEXT_CLASS_NAME, "mt-2 text-amber-700 dark:text-amber-300")}>
            GitHub's search cap was reached. This is a verified lower bound.
          </p>
        ) : null}
      </DisclosureRegion>
    </>
  );
}

export function MergeFlexReceiptsCard({ repository }: { repository: string | null }) {
  const [requestedScope, setRequestedScope] = useState<MergeFlexScopeChoice>("all");
  const [day, setDay] = useState(() => localCalendarDayRange());
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const scope: MergeFlexScopeChoice = repository ? requestedScope : "all";
  const input = useMemo<MergeFlexReceiptsInput>(
    () => ({
      ...day,
      scope:
        scope === "repository" && repository ? { type: "repository", repository } : { type: "all" },
    }),
    [day, repository, scope],
  );
  const query = useQuery(pullRequestsMergedTodayQueryOptions(input));
  const error = query.isError && query.data === undefined ? query.error : null;
  const backgroundError = query.isError && query.data !== undefined;

  const handleRefresh = () => {
    const nextDay = localCalendarDayRange();
    if (
      nextDay.date !== day.date ||
      nextDay.startedAt !== day.startedAt ||
      nextDay.endedAt !== day.endedAt
    ) {
      setComposerOpen(false);
      setDay(nextDay);
      return;
    }
    void query.refetch();
  };

  return (
    <section className="rounded-xl border border-border/65 bg-[var(--color-background-elevated-primary-opaque)] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={cn(PR_BODY_TEXT_CLASS_NAME, "font-heading font-semibold")}>
            Your PRs merged today
          </h2>
          <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME, "mt-0.5")}>
            Factual GitHub receipts for your current local calendar day.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <PullRequestFilterPillGroup
            value={scope}
            options={[
              { value: "all", label: "All repos" },
              {
                value: "repository",
                label: "This repo",
                disabled: repository === null,
                title: repository ? repository : "Choose a project with a GitHub repository",
              },
            ]}
            onChange={(nextScope) => {
              setRequestedScope(nextScope);
              setReceiptsOpen(false);
              setComposerOpen(false);
            }}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh Merge Flex receipts"
            title="Refresh receipts"
            disabled={query.isFetching}
            onClick={handleRefresh}
          >
            <RefreshCwIcon className={cn("size-4", query.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <div aria-label="Loading merged pull request receipts" className="space-y-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
          <p className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>
            {mergeFlexErrorCopy(error).title}
          </p>
          <p className={cn(PR_FINE_TEXT_CLASS_NAME, "mt-1 text-muted-foreground")}>
            {mergeFlexErrorCopy(error).detail}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : query.data ? (
        <MergeFlexReceiptsContent
          result={query.data}
          receiptsOpen={receiptsOpen}
          onReceiptsOpenChange={setReceiptsOpen}
          onFlexOnX={() => setComposerOpen(true)}
        />
      ) : null}

      {backgroundError ? (
        <p className={cn(PR_FINE_TEXT_CLASS_NAME, "mt-3 text-amber-700 dark:text-amber-300")}>
          Refresh failed. Showing the last verified receipts.
        </p>
      ) : null}
      <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME, "mt-4")}>
        Share defaults use only the aggregate count. Repository names, titles, and links stay local
        unless you explicitly include them.
      </p>
      {query.data && composerOpen ? (
        <FactualMergeFlexComposer
          key={`${query.data.date}:${query.data.viewer}:${query.data.scope.type}:${query.data.scope.type === "repository" ? query.data.scope.repository : "all"}:${query.data.count}:${query.data.incomplete}:${query.data.receipts.map((receipt) => `${receipt.repository}:${receipt.repositoryVisibility}`).join(",")}`}
          open={composerOpen}
          result={query.data}
          onOpenChange={setComposerOpen}
        />
      ) : null}
    </section>
  );
}
