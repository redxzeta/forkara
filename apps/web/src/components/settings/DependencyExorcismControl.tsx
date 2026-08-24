import type {
  DependencyCleanupPreview,
  DependencyCleanupResult,
  NativeApi,
} from "@forkara/contracts";
import { useEffect, useState } from "react";

import { Button } from "../ui/button";

type ResetDepartmentApi = NonNullable<NativeApi["resetDepartment"]>;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Dependency cleanup failed.";
}

export function DependencyExorcismControl({
  api,
  workspaceRoot,
  onStatus,
}: {
  readonly api: ResetDepartmentApi | null;
  readonly workspaceRoot: string | null;
  readonly onStatus: (message: string) => void;
}) {
  const [preview, setPreview] = useState<DependencyCleanupPreview | null>(null);
  const [result, setResult] = useState<DependencyCleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
    setResult(null);
    setError(null);
  }, [workspaceRoot]);

  async function inspect(): Promise<void> {
    if (!api || !workspaceRoot || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const nextPreview = await api.previewDependencyCleanup({ cwd: workspaceRoot });
      setPreview(nextPreview);
      onStatus(
        nextPreview.state === "missing"
          ? "Nothing to exorcise. node_modules is already absent."
          : "Dependency cleanup preview is ready. Review the exact path before deleting.",
      );
    } catch (cause) {
      const message = errorMessage(cause);
      setPreview(null);
      setError(message);
      onStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function execute(): Promise<void> {
    if (!api || !workspaceRoot || busy || preview?.state !== "ready") return;
    setBusy(true);
    setError(null);
    try {
      const nextResult = await api.executeDependencyCleanup({ cwd: workspaceRoot });
      setResult(nextResult);
      setPreview(null);
      onStatus(
        nextResult.removed
          ? "Dependencies successfully forgotten. No install command was run."
          : "Nothing to exorcise. node_modules was already absent.",
      );
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      setPreview(null);
      onStatus(message);
    } finally {
      setBusy(false);
    }
  }

  const inspected = result ?? preview;
  const unavailableMessage = !workspaceRoot
    ? "Open a project to choose its dependency directory."
    : !api
      ? "Dependency cleanup is unavailable on this server."
      : null;

  return (
    <div className="mt-3 space-y-2">
      {inspected ? (
        <div className="rounded-lg border bg-background/60 px-3 py-2 text-xs">
          <p className="font-medium text-foreground">
            {inspected.state === "ready" ? "Exact deletion target" : "Nothing to exorcise"}
          </p>
          <code className="mt-1 block break-all text-muted-foreground">{inspected.targetPath}</code>
          {inspected.installCommand ? (
            <p className="mt-2 text-muted-foreground">
              Suggested reinstall: <code>{inspected.installCommand}</code>. Forkara will not run it.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {unavailableMessage ? (
        <p className="text-xs text-muted-foreground">{unavailableMessage}</p>
      ) : null}
      {preview?.state === "ready" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setPreview(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive-outline"
            disabled={busy}
            onClick={() => void execute()}
          >
            {busy ? "Exorcising…" : "Delete node_modules"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          disabled={busy || unavailableMessage !== null}
          aria-label="Preview Delete node_modules — LOW RISK"
          onClick={() => void inspect()}
        >
          {busy ? "Inspecting…" : "Preview cleanup"}
        </Button>
      )}
    </div>
  );
}
