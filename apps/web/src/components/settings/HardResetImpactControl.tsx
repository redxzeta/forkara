import type { HardResetImpactSnapshot, NativeApi } from "@forkara/contracts";
import { useEffect, useRef, useState } from "react";

import { Button } from "../ui/button";

type ResetDepartmentApi = NonNullable<NativeApi["resetDepartment"]>;

function countLabel(files: readonly string[] | null, noun: string): string {
  if (files === null) return `${noun}: unknown`;
  return `${noun}: ${files.length}`;
}

export function HardResetGuardPanel({
  api,
  workspaceRoot,
  onStatus,
}: {
  readonly api: ResetDepartmentApi | null;
  readonly workspaceRoot: string | null;
  readonly onStatus: (message: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<HardResetImpactSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"inspect" | "stash" | null>(null);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    setSnapshot(null);
    setError(null);
    setBusy(null);
    setRequiresRefresh(false);
  }, [workspaceRoot]);

  async function inspect(): Promise<void> {
    if (!api || !workspaceRoot || busy) return;
    const requestId = ++requestIdRef.current;
    setBusy("inspect");
    setError(null);
    setRequiresRefresh(false);
    try {
      const nextSnapshot = await api.inspectHardResetImpact({ cwd: workspaceRoot });
      if (requestIdRef.current !== requestId) return;
      setSnapshot(nextSnapshot);
      onStatus(
        nextSnapshot.repositoryState === "ready"
          ? "Hard-reset impact inspected. No Git mutation ran."
          : "The active workspace is not a Git worktree. No Git mutation ran.",
      );
    } catch (cause) {
      if (requestIdRef.current !== requestId) return;
      const message =
        cause instanceof Error ? cause.message : "Could not inspect Git reset impact.";
      setSnapshot(null);
      setError(message);
      onStatus(message);
    } finally {
      if (requestIdRef.current === requestId) setBusy(null);
    }
  }

  async function stashInstead(): Promise<void> {
    if (
      !api ||
      !workspaceRoot ||
      busy ||
      snapshot?.repositoryState !== "ready" ||
      snapshot.repositoryIdentity === null ||
      snapshot.head === null ||
      snapshot.fingerprint === null
    ) {
      return;
    }
    const requestId = ++requestIdRef.current;
    setBusy("stash");
    setError(null);
    try {
      const result = await api.stashHardResetChanges({
        cwd: workspaceRoot,
        expectedRepositoryIdentity: snapshot.repositoryIdentity,
        expectedHead: snapshot.head,
        expectedFingerprint: snapshot.fingerprint,
      });
      if (requestIdRef.current !== requestId) return;
      setSnapshot(result.snapshot);
      setRequiresRefresh(false);
      onStatus(
        result.status === "stashed"
          ? "Crisis postponed successfully. Staged, unstaged, and untracked changes were stashed; ignored files were excluded."
          : "Nothing to stash. Ignored files, if any, were excluded.",
      );
    } catch (cause) {
      if (requestIdRef.current !== requestId) return;
      const message = cause instanceof Error ? cause.message : "Could not stash local changes.";
      setSnapshot(null);
      setRequiresRefresh(true);
      setError(`${message} Refresh the impact before continuing.`);
      onStatus(`${message} Refresh the impact before continuing.`);
    } finally {
      if (requestIdRef.current === requestId) setBusy(null);
    }
  }

  function cancel(): void {
    requestIdRef.current += 1;
    setSnapshot(null);
    setError(null);
    setBusy(null);
    setRequiresRefresh(false);
    onStatus("Hard reset cancelled. No Git mutation ran.");
  }

  const unavailableMessage = !workspaceRoot
    ? "Open a project to inspect its repository."
    : !api
      ? "Git impact inspection is unavailable on this server."
      : null;
  const hasLocalChanges =
    snapshot?.repositoryState === "ready" &&
    [snapshot.stagedTracked, snapshot.unstagedTracked, snapshot.untracked, snapshot.conflicts].some(
      (files) => files !== null && files.length > 0,
    );
  const hasGuardFacts =
    snapshot?.repositoryState === "ready" &&
    snapshot.repositoryIdentity !== null &&
    snapshot.head !== null &&
    snapshot.fingerprint !== null;

  return (
    <div className="mt-3 space-y-2">
      {snapshot?.repositoryState === "not-repository" ? (
        <p className="rounded-lg border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          Not a Git worktree. Branch, HEAD, and file impact remain unknown.
        </p>
      ) : null}
      {snapshot?.repositoryState === "ready" ? (
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-background/60 px-3 py-2 text-xs">
          <div>
            <p className="font-medium text-foreground">
              {snapshot.detached ? "Detached HEAD" : (snapshot.branch ?? "Branch unknown")}
            </p>
            <code className="block break-all text-muted-foreground">
              {snapshot.head ?? "HEAD unknown"}
            </code>
          </div>
          <div className="grid grid-cols-2 gap-1 text-muted-foreground">
            <span>{countLabel(snapshot.stagedTracked, "Staged tracked")}</span>
            <span>{countLabel(snapshot.unstagedTracked, "Unstaged tracked")}</span>
            <span>{countLabel(snapshot.untracked, "Untracked")}</span>
            <span>{countLabel(snapshot.conflicts, "Conflicts")}</span>
          </div>
          <p className="font-medium text-destructive">
            `git reset --hard HEAD` would discard staged and unstaged tracked changes. Untracked
            files would remain.
          </p>
          <p className="font-medium text-foreground">
            Stash includes staged, unstaged, and untracked changes. Ignored files are excluded.
          </p>
          {snapshot.operationState === "unknown" ? (
            <p className="text-muted-foreground">
              The active merge/rebase state could not be determined.
            </p>
          ) : snapshot.operationState !== "none" ? (
            <p className="text-muted-foreground">
              Repository operation: {snapshot.operationState}. Resolve it before any reset.
            </p>
          ) : null}
          <code className="block break-all text-[10px] text-muted-foreground">
            {snapshot.repositoryRoot}
          </code>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {requiresRefresh ? (
        <p className="text-xs font-medium text-destructive">
          Further progress is blocked until a fresh inspection succeeds.
        </p>
      ) : null}
      {unavailableMessage ? (
        <p className="text-xs text-muted-foreground">{unavailableMessage}</p>
      ) : null}
      {snapshot ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {hasLocalChanges ? (
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={busy !== null || !hasGuardFacts}
              onClick={() => void stashInstead()}
            >
              {busy === "stash" ? "Stashing…" : "Stash Changes Instead"}
            </Button>
          ) : (
            <p className="self-center text-center text-xs text-muted-foreground">
              Nothing to stash.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            onClick={cancel}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="destructive-outline"
        className="w-full"
        disabled={busy !== null || unavailableMessage !== null}
        aria-label="Inspect git reset --hard impact — DANGER"
        onClick={() => void inspect()}
      >
        {busy === "inspect"
          ? "Inspecting…"
          : requiresRefresh || snapshot
            ? "Refresh impact"
            : "Inspect impact"}
      </Button>
    </div>
  );
}
