// FILE: EnvironmentReadmeTruthinessSection.tsx
// Purpose: Run the shared parody checker over a local README and cached upstream facts.
// Layer: Environment panel UI; performs no fetch or repository mutation.

import { detectReadmeTruthiness } from "@forkara/shared/readmeTruthiness";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { recordAchievementEvent } from "~/achievements/engine";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { FileIcon, RefreshCwIcon } from "~/lib/icons";
import { ensureNativeApi } from "~/nativeApi";

import {
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentLabeledSection,
  EnvironmentRow,
} from "./EnvironmentRow";

export function EnvironmentReadmeTruthinessSection({
  gitCwd,
  enabled,
}: {
  gitCwd: string | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const resultQuery = useQuery({
    queryKey: ["readme-truthiness", gitCwd],
    queryFn: async () => {
      if (!gitCwd) throw new Error("A repository is required.");
      const api = ensureNativeApi();
      const [readme, upstream] = await Promise.all([
        api.projects.readFile({ cwd: gitCwd, relativePath: "README.md", maxBytes: 256_000 }),
        api.git.upstreamStatus({ cwd: gitCwd }),
      ]);
      return {
        findings: detectReadmeTruthiness(readme.contents, {
          upstreamRef: upstream.upstreamBranch ? `upstream/${upstream.upstreamBranch}` : null,
          hasUpstreamRemote: upstream.hasUpstream,
          remotes: upstream.hasUpstream
            ? [{ name: "upstream", fetchUrl: "configured local remote" }]
            : [],
        }),
        truncated: readme.truncated,
      };
    },
    enabled: enabled && open && gitCwd !== null,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (resultQuery.data) {
      recordAchievementEvent({ type: "readme_truthiness.result" });
    }
  }, [resultQuery.data]);

  if (!enabled || !gitCwd) return null;
  return (
    <EnvironmentLabeledSection label="Fork Lore">
      <EnvironmentRow
        icon={<FileIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} aria-hidden />}
        label="README Truthiness Checker"
        trailing={
          resultQuery.isFetching ? (
            <RefreshCwIcon className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : null
        }
        title="Compare README bravado with cached local upstream facts"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>README Truthiness Checker</DialogTitle>
            <DialogDescription>
              A deterministic parody check over the local README and cached Git facts.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {resultQuery.isPending ? (
              <p className="text-muted-foreground text-sm">Reading local evidence…</p>
            ) : resultQuery.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Unable to inspect README.md</p>
                <p className="mt-1 text-muted-foreground">
                  {resultQuery.error instanceof Error
                    ? resultQuery.error.message
                    : "An unknown error occurred."}
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => void resultQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : resultQuery.data ? (
              <div className="space-y-3">
                {resultQuery.data.findings.length > 0 ? (
                  <ul className="space-y-2">
                    {resultQuery.data.findings.map((finding) => (
                      <li
                        key={finding.id}
                        className="rounded-xl border border-warning/30 bg-warning/5 p-3"
                      >
                        <p className="font-medium text-sm">{finding.title}</p>
                        <p className="mt-1 text-muted-foreground text-sm">{finding.message}</p>
                        <ul className="mt-2 space-y-1 text-muted-foreground text-xs">
                          {finding.readmeClaims.map((claim) => (
                            <li key={`${finding.id}-${claim.line}`}>
                              README {claim.line}: {claim.text}
                            </li>
                          ))}
                          {finding.evidence.map((evidence) => (
                            <li key={evidence}>Evidence: {evidence}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
                    Nothing suspicious found in the supported claims.
                  </p>
                )}
                {resultQuery.data.truncated ? (
                  <p className="text-warning text-xs">
                    README.md was truncated; only the returned local content was checked.
                  </p>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  This is a joke, not a legal, ownership, or authorship determination. No network
                  request is made.
                </p>
              </div>
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </EnvironmentLabeledSection>
  );
}
