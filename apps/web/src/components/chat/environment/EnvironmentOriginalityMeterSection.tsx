// FILE: EnvironmentOriginalityMeterSection.tsx
// Purpose: Explicitly satirical score over factual fork-only tree changes.
// Layer: Environment panel section and details dialog

import type { GitOriginalityMeterResult } from "@forkara/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { RefreshCwIcon, StarIcon } from "~/lib/icons";
import { GIT_EXPENSIVE_READ_RETRY_OPTIONS, gitQueryKeys } from "~/lib/gitReactQuery";
import { originalityCertification } from "~/lib/originalityCertification";
import { ensureNativeApi } from "~/nativeApi";

import {
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
} from "./EnvironmentRow";

function unavailableTitle(state: GitOriginalityMeterResult["state"]): string {
  switch (state) {
    case "ready":
      return "Originality calculated";
    case "missing_upstream":
      return "Upstream required";
    case "incomplete_history":
      return "History incomplete";
    case "unrelated_history":
      return "No common ancestry";
  }
}

export function OriginalityMeterReport({ result }: { result: GitOriginalityMeterResult }) {
  const available = result.state === "ready" && result.scorePercent !== null;
  const certification = originalityCertification(result);
  return (
    <div className="space-y-4">
      <section
        aria-labelledby="originality-meter-score-heading"
        className="rounded-xl border border-border bg-muted/20 p-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Originality Meter™
            </p>
            <h3 id="originality-meter-score-heading" className="mt-1 font-semibold text-lg">
              {available
                ? `Originality: ${result.scorePercent}% ✨`
                : unavailableTitle(result.state)}
            </h3>
          </div>
          <StarIcon className="size-5 shrink-0 text-warning" aria-hidden />
        </div>
        <p className="mt-2 text-muted-foreground text-sm">{result.message}</p>
        {certification ? (
          <div className="mt-3 rounded-lg border border-border/70 bg-background/60 p-2.5">
            <Badge
              variant={certification.variant}
              size="lg"
              aria-label={certification.accessibleText}
            >
              <StarIcon aria-hidden />
              {certification.label}
            </Badge>
            <p className="mt-1.5 text-muted-foreground text-xs">{certification.description}</p>
            {certification.disclaimer ? (
              <p className="mt-1 font-medium text-warning text-xs">{certification.disclaimer}</p>
            ) : null}
          </div>
        ) : null}
        <p className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-2 text-sm">
          This score is a joke. It is not a measure of legal originality, authorship, ownership, or
          license compliance.
        </p>
      </section>

      {available ? (
        <section aria-labelledby="originality-meter-facts-heading" className="space-y-2">
          <h3 id="originality-meter-facts-heading" className="font-medium text-sm">
            Factual receipts
          </h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-border/70 p-2">
              <dt className="text-muted-foreground text-xs">Eligible files changed</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {result.changedFileCount} of {result.comparableFileCount}
              </dd>
            </div>
            <div className="rounded-lg border border-border/70 p-2">
              <dt className="text-muted-foreground text-xs">Text-line diff</dt>
              <dd
                className="mt-0.5 font-medium tabular-nums"
                aria-label={`${result.insertions} insertions, ${result.deletions} deletions`}
              >
                +{result.insertions} −{result.deletions}
              </dd>
            </div>
            <div className="rounded-lg border border-border/70 p-2">
              <dt className="text-muted-foreground text-xs">Fork-only commits</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{result.forkUniqueCommitCount}</dd>
            </div>
            <div className="rounded-lg border border-border/70 p-2">
              <dt className="text-muted-foreground text-xs">Upstream-only commits</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {result.upstreamUniqueCommitCount}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="originality-meter-method-heading" className="space-y-2">
        <h3 id="originality-meter-method-heading" className="font-medium text-sm">
          How the joke is calculated
        </h3>
        <p className="text-muted-foreground text-sm">
          Changed eligible files between the exact Git merge-base and committed HEAD ÷ eligible
          files present in either tree, rounded to the nearest whole percent. Text-line and commit
          counts are receipts; they do not alter the score.
        </p>
        <p className="text-muted-foreground text-xs">
          Excluded: {result.excludedFileCount} files, including {result.binaryFileCount} binary diff
          entries.
        </p>
        <ul className="space-y-1 text-muted-foreground text-xs">
          {result.exclusionRules.map((rule) => (
            <li key={rule}>• {rule}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function EnvironmentOriginalityMeterSection({
  gitCwd,
  enabled,
}: {
  gitCwd: string | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const originalityQuery = useQuery({
    queryKey: gitQueryKeys.originalityMeter(gitCwd),
    queryFn: () => {
      if (!gitCwd) throw new Error("A repository is required.");
      return ensureNativeApi().git.originalityMeter({ cwd: gitCwd });
    },
    enabled: enabled && open && gitCwd !== null,
    staleTime: 60_000,
    ...GIT_EXPENSIVE_READ_RETRY_OPTIONS,
  });
  if (!enabled || !gitCwd) return null;

  return (
    <EnvironmentLabeledSection label="Fork Lore">
      <EnvironmentRow
        icon={<StarIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
        label="Originality Meter™"
        trailing={
          originalityQuery.isFetching ? (
            <RefreshCwIcon className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : originalityQuery.data?.scorePercent !== null &&
            originalityQuery.data?.scorePercent !== undefined ? (
            <span className="text-muted-foreground text-xs">
              {originalityQuery.data.scorePercent}%
            </span>
          ) : null
        }
        title="Calculate a parody originality score from factual fork changes"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Originality Meter™</DialogTitle>
            <DialogDescription>
              A deterministic joke built on exact local Git provenance.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {originalityQuery.isPending ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
                Consulting the originality department…
              </div>
            ) : originalityQuery.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Unable to calculate originality</p>
                <p className="mt-1 text-muted-foreground">
                  {originalityQuery.error instanceof Error
                    ? originalityQuery.error.message
                    : "An unknown error occurred."}
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => void originalityQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : originalityQuery.data ? (
              <OriginalityMeterReport result={originalityQuery.data} />
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </EnvironmentLabeledSection>
  );
}
