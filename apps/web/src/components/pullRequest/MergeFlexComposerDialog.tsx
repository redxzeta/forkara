import type {
  MergeFlexReceiptsResult,
  XConnectionStatus,
  XCreatePostResult,
} from "@forkara/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { projectFactualMergeFlexCard, projectParodyMergeFlexCard } from "~/lib/mergeFlexCard";
import {
  composeMergeFlexFactualDraft,
  composeMergeFlexParodyDraft,
  countUnicodeCharacters,
  createMergeFlexPostGate,
  factualShareableRepository,
  finalizeMergeFlexParodyPost,
  MERGE_FLEX_FACTUAL_TEMPLATES,
  type MergeFlexFactualTemplateId,
  type MergeFlexParodyTemplateId,
  mergeFlexErrorMessage,
  mergeFlexScopeLabel,
  parseMergeFlexParodyCount,
  startExplicitMergeFlexPost,
} from "~/lib/mergeFlexComposer";
import { xConnectionStatusQueryOptions, xPostQueryKeys } from "~/lib/xPostReactQuery";
import { cn } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";
import {
  PR_FINE_TEXT_CLASS_NAME,
  PR_META_TEXT_CLASS_NAME,
  PR_QUIET_INK_CLASS_NAME,
} from "./pullRequestText";
import { MergeFlexParodyPanel } from "./MergeFlexParodyPanel";
import { MergeFlexShareCardPanel } from "./MergeFlexShareCard";

type MergeFlexSourceMode = "factual" | "parody";

export interface MergeFlexComposerDialogProps {
  readonly open: boolean;
  readonly result: MergeFlexReceiptsResult;
  readonly connectionStatus: XConnectionStatus | null;
  readonly connectionLoading?: boolean;
  readonly connectionLoadError?: unknown;
  readonly authorizationUrl: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onBeginConnect: () => Promise<void>;
  readonly onRetryConnectionStatus: () => Promise<void>;
  readonly onOpenAuthorization: () => Promise<void>;
  readonly onPost: (text: string) => Promise<XCreatePostResult>;
  readonly onOpenPost: (url: string) => Promise<void>;
}

function connectionSummary(status: XConnectionStatus | null): string {
  if (status === null) return "X connection state is unavailable.";
  switch (status.state) {
    case "unconfigured":
    case "needs-auth":
    case "error":
      return status.message;
    case "disconnected":
      return "Connect X before posting. Your draft will stay in this composer.";
    case "connecting":
      return "Finish the user-driven authorization in X. This composer will keep your draft.";
    case "connected":
      return status.handle ? `Connected as @${status.handle}.` : "X account connected.";
  }
}

function canBeginConnection(
  status: XConnectionStatus | null,
  authorizationUrl: string | null,
): boolean {
  return (
    status?.state === "disconnected" ||
    status?.state === "needs-auth" ||
    status?.state === "error" ||
    (status?.state === "connecting" && authorizationUrl === null)
  );
}

function beginConnectionLabel(status: XConnectionStatus | null): string {
  if (status?.state === "connecting") return "Restart X authorization";
  if (status?.state === "needs-auth") return "Reconnect X account";
  if (status?.state === "error") return "Retry X connection";
  return "Connect X account";
}

export function MergeFlexComposerDialog(props: MergeFlexComposerDialogProps) {
  const repositoryOption = factualShareableRepository(props.result);
  const [sourceMode, setSourceMode] = useState<MergeFlexSourceMode>("factual");
  const [factualTemplateId, setFactualTemplateId] =
    useState<MergeFlexFactualTemplateId>("receipts");
  const [parodyTemplateId, setParodyTemplateId] = useState<MergeFlexParodyTemplateId>("accounting");
  const [includeRepository, setIncludeRepository] = useState(false);
  const initialFactualDraft = useMemo(
    () =>
      composeMergeFlexFactualDraft("receipts", {
        count: props.result.count,
        date: props.result.date,
        incomplete: props.result.incomplete,
        repository: null,
      }),
    [props.result.count, props.result.date, props.result.incomplete],
  );
  const [factualDraft, setFactualDraft] = useState(initialFactualDraft);
  const [parodyCountInput, setParodyCountInput] = useState("42");
  const [parodyCount, setParodyCount] = useState(42);
  const [parodyDraft, setParodyDraft] = useState(() =>
    composeMergeFlexParodyDraft("accounting", { count: 42, date: props.result.date }),
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionActionError, setConnectionActionError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<XCreatePostResult | null>(null);
  const [openPostError, setOpenPostError] = useState<string | null>(null);
  const postingGateRef = useRef(createMergeFlexPostGate());
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!props.open) return;
    const frame = window.requestAnimationFrame(() => editorRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [props.open]);

  const clearPostFeedback = () => {
    setPostError(null);
    setPostResult(null);
    setOpenPostError(null);
  };

  const replaceFromFactualTemplate = (
    nextTemplateId: MergeFlexFactualTemplateId,
    nextIncludeRepository: boolean,
  ) => {
    setFactualTemplateId(nextTemplateId);
    setIncludeRepository(nextIncludeRepository);
    setFactualDraft(
      composeMergeFlexFactualDraft(nextTemplateId, {
        count: props.result.count,
        date: props.result.date,
        incomplete: props.result.incomplete,
        repository: nextIncludeRepository ? repositoryOption : null,
      }),
    );
    clearPostFeedback();
  };

  const replaceFromParodyTemplate = (nextTemplateId: MergeFlexParodyTemplateId, count: number) => {
    setParodyTemplateId(nextTemplateId);
    setParodyDraft(composeMergeFlexParodyDraft(nextTemplateId, { count, date: props.result.date }));
    clearPostFeedback();
  };

  const setParodyCountFromPreset = (count: number) => {
    setParodyCountInput(String(count));
    setParodyCount(count);
    replaceFromParodyTemplate(parodyTemplateId, count);
  };

  const updateParodyCount = (value: string) => {
    setParodyCountInput(value);
    const count = parseMergeFlexParodyCount(value);
    if (count === null) {
      clearPostFeedback();
      return;
    }
    setParodyCount(count);
    replaceFromParodyTemplate(parodyTemplateId, count);
  };

  const switchSourceMode = (mode: MergeFlexSourceMode) => {
    if (isPosting || mode === sourceMode) return;
    setSourceMode(mode);
    clearPostFeedback();
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };

  const beginConnection = async () => {
    if (isConnecting || !canBeginConnection(props.connectionStatus, props.authorizationUrl)) return;
    setIsConnecting(true);
    setConnectionActionError(null);
    try {
      await props.onBeginConnect();
    } catch (error) {
      setConnectionActionError(
        mergeFlexErrorMessage(error, "Forkara could not start the X connection."),
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const openAuthorization = async () => {
    setConnectionActionError(null);
    try {
      await props.onOpenAuthorization();
    } catch (error) {
      setConnectionActionError(
        mergeFlexErrorMessage(error, "Forkara could not open the X authorization page."),
      );
    }
  };

  const submit = async () => {
    const submission = startExplicitMergeFlexPost(
      postingGateRef.current,
      { connected: props.connectionStatus?.state === "connected", text: finalPreview },
      props.onPost,
    );
    if (!submission) return;
    setIsPosting(true);
    setPostError(null);
    setPostResult(null);
    setOpenPostError(null);
    const outcome = await submission;
    if (outcome.status === "success") {
      setPostResult(outcome.result);
    } else {
      setPostError(
        mergeFlexErrorMessage(outcome.error, "X did not accept the post. Your draft is intact."),
      );
    }
    setIsPosting(false);
  };

  const openPostedResult = async () => {
    if (!postResult) return;
    setOpenPostError(null);
    try {
      await props.onOpenPost(postResult.url);
    } catch (error) {
      setOpenPostError(mergeFlexErrorMessage(error, "Forkara could not open the posted X URL."));
    }
  };

  const parodyCountValid = parseMergeFlexParodyCount(parodyCountInput) !== null;
  const activeDraft = sourceMode === "factual" ? factualDraft : parodyDraft;
  const finalPreview =
    sourceMode === "factual" ? factualDraft : finalizeMergeFlexParodyPost(parodyDraft);
  const cardModel = useMemo(
    () =>
      sourceMode === "factual"
        ? projectFactualMergeFlexCard(props.result)
        : parodyCountValid
          ? projectParodyMergeFlexCard({ count: parodyCount, date: props.result.date })
          : null,
    [parodyCount, parodyCountValid, props.result, sourceMode],
  );
  const connected = props.connectionStatus?.state === "connected";
  const canPost =
    connected &&
    activeDraft.trim().length > 0 &&
    (sourceMode === "factual" || parodyCountValid) &&
    !isPosting &&
    postResult === null;
  const characterCount = countUnicodeCharacters(finalPreview);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(nextOpen) => {
        if (!isPosting) props.onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="max-w-2xl" showCloseButton={!isPosting}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant={sourceMode === "factual" ? "success" : "warning"}>
              {sourceMode === "factual" ? "FACTUAL RECEIPTS" : "ALLEGED RECEIPTS"}
            </Badge>
            <span className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>
              {sourceMode === "factual" ? `@${props.result.viewer}` : "PR Inflation Department"}
            </span>
          </div>
          <DialogTitle>Flex on X</DialogTitle>
          <DialogDescription>
            Review the exact public text and its source mode below. Opening this composer never
            posts anything.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <div
            role="radiogroup"
            aria-label="Merge Flex source mode"
            className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-1"
          >
            <Button
              type="button"
              role="radio"
              aria-checked={sourceMode === "factual"}
              variant={sourceMode === "factual" ? "secondary" : "ghost"}
              disabled={isPosting}
              onClick={() => switchSourceMode("factual")}
            >
              Receipts · factual
            </Button>
            <Button
              type="button"
              role="radio"
              aria-checked={sourceMode === "parody"}
              variant={sourceMode === "parody" ? "secondary" : "ghost"}
              disabled={isPosting}
              onClick={() => switchSourceMode("parody")}
            >
              Resume-Driven Development
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-sm sm:grid-cols-3">
            <div>
              <dt className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>
                {sourceMode === "factual" ? "Merged" : "Alleged"}
              </dt>
              <dd className="font-heading text-lg font-semibold tabular-nums">
                {sourceMode === "factual"
                  ? props.result.incomplete
                    ? `${props.result.count}+`
                    : props.result.count
                  : parodyCountValid
                    ? parodyCount
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>Date</dt>
              <dd className={PR_META_TEXT_CLASS_NAME}>{props.result.date}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>Source</dt>
              <dd className={PR_META_TEXT_CLASS_NAME}>
                {sourceMode === "factual"
                  ? mergeFlexScopeLabel(props.result)
                  : "Accounting Department"}
              </dd>
            </div>
          </dl>

          {sourceMode === "factual" ? (
            <>
              <fieldset className="space-y-2" disabled={isPosting}>
                <legend className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>
                  Copy template
                </legend>
                <div className="flex flex-wrap gap-2">
                  {MERGE_FLEX_FACTUAL_TEMPLATES.map((template) => (
                    <Button
                      key={template.id}
                      type="button"
                      size="sm"
                      variant={factualTemplateId === template.id ? "secondary" : "outline"}
                      aria-pressed={factualTemplateId === template.id}
                      onClick={() => replaceFromFactualTemplate(template.id, includeRepository)}
                    >
                      {template.label}
                    </Button>
                  ))}
                </div>
              </fieldset>

              {repositoryOption ? (
                <label className="flex items-start gap-2 rounded-lg border border-border/60 p-3">
                  <Checkbox
                    checked={includeRepository}
                    disabled={isPosting}
                    onCheckedChange={(checked) =>
                      replaceFromFactualTemplate(factualTemplateId, checked)
                    }
                  />
                  <span>
                    <span className={cn(PR_META_TEXT_CLASS_NAME, "block font-medium")}>
                      Include {repositoryOption}
                    </span>
                    <span className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME, "block")}>
                      Optional. GitHub classified this current repository as public; it is excluded
                      by default.
                    </span>
                  </span>
                </label>
              ) : (
                <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>
                  Repository names, PR titles, URLs, organizations, and branches are excluded from
                  this public draft.
                </p>
              )}
            </>
          ) : (
            <MergeFlexParodyPanel
              count={parodyCount}
              countInput={parodyCountInput}
              countValid={parodyCountValid}
              date={props.result.date}
              disabled={isPosting}
              templateId={parodyTemplateId}
              onCountInputChange={updateParodyCount}
              onPreset={setParodyCountFromPreset}
              onTemplateChange={(templateId) => replaceFromParodyTemplate(templateId, parodyCount)}
            />
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="merge-flex-x-draft"
                className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}
              >
                Post text
              </label>
              <span
                className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}
                aria-live="polite"
              >
                {characterCount} {characterCount === 1 ? "character" : "characters"}
              </span>
            </div>
            <Textarea
              id="merge-flex-x-draft"
              ref={editorRef}
              value={activeDraft}
              disabled={isPosting}
              aria-describedby="merge-flex-x-length-note"
              className="[&_[data-slot=textarea]]:min-h-28 [&_[data-slot=textarea]]:resize-y"
              onChange={(event) => {
                if (sourceMode === "factual") {
                  setFactualDraft(event.target.value);
                } else {
                  setParodyDraft(event.target.value);
                }
                clearPostFeedback();
              }}
            />
            <p
              id="merge-flex-x-length-note"
              className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}
            >
              {sourceMode === "factual"
                ? "X applies its own weighted-length validation when you explicitly post."
                : "Public posts always include the source marker shown in the preview."}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>
              Final preview · {sourceMode === "factual" ? "factual receipts" : "source: vibes"}
            </p>
            <blockquote className="whitespace-pre-wrap break-words rounded-xl border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed">
              {activeDraft.length > 0 ? finalPreview : "Your preview will appear here."}
            </blockquote>
          </div>

          <MergeFlexShareCardPanel model={cardModel} disabled={isPosting} />

          <section
            className="space-y-2 rounded-xl border border-border/60 p-3"
            aria-label="X connection"
          >
            <p className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>X connection</p>
            <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)} aria-live="polite">
              {props.connectionLoading
                ? "Checking the local X connection…"
                : props.connectionLoadError
                  ? mergeFlexErrorMessage(
                      props.connectionLoadError,
                      "Forkara could not load the X connection state.",
                    )
                  : connectionSummary(props.connectionStatus)}
            </p>
            {props.connectionLoadError ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.connectionLoading || isPosting}
                onClick={() => void props.onRetryConnectionStatus()}
              >
                Retry connection status
              </Button>
            ) : canBeginConnection(props.connectionStatus, props.authorizationUrl) ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isConnecting || isPosting}
                onClick={() => void beginConnection()}
              >
                {isConnecting ? <Spinner /> : null}
                {isConnecting ? "Opening X…" : beginConnectionLabel(props.connectionStatus)}
              </Button>
            ) : null}
            {props.connectionStatus?.state === "connecting" && props.authorizationUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPosting}
                onClick={() => void openAuthorization()}
              >
                Open X authorization
              </Button>
            ) : null}
          </section>

          {connectionActionError ? (
            <p role="alert" className="text-sm text-destructive">
              {connectionActionError}
            </p>
          ) : null}
          {postError ? (
            <p role="alert" className="text-sm text-destructive">
              {postError} Your draft was not cleared.
            </p>
          ) : null}
          {postResult ? (
            <div role="status" className="rounded-xl border border-success/30 bg-success/5 p-3">
              <p className={cn(PR_META_TEXT_CLASS_NAME, "font-medium text-success")}>Posted to X</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void openPostedResult()}
              >
                Open post
              </Button>
            </div>
          ) : null}
          {openPostError ? (
            <p role="alert" className="text-sm text-destructive">
              {openPostError}
            </p>
          ) : null}
        </DialogPanel>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPosting}
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canPost} onClick={() => void submit()}>
            {isPosting ? <Spinner /> : null}
            {isPosting ? "Posting…" : postResult ? "Posted" : "Post to X"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function FactualMergeFlexComposer(props: {
  readonly open: boolean;
  readonly result: MergeFlexReceiptsResult;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const statusQuery = useQuery(xConnectionStatusQueryOptions(props.open));

  const beginConnect = async () => {
    const result = await ensureNativeApi().x.beginConnect();
    setAuthorizationUrl(result.authorizationUrl);
    queryClient.setQueryData(xPostQueryKeys.connectionStatus, result.status);
    await ensureNativeApi().shell.openExternal(result.authorizationUrl);
  };

  return (
    <MergeFlexComposerDialog
      open={props.open}
      result={props.result}
      connectionStatus={statusQuery.data ?? null}
      connectionLoading={statusQuery.isPending || statusQuery.isFetching}
      connectionLoadError={
        statusQuery.isError && statusQuery.data === undefined ? statusQuery.error : null
      }
      authorizationUrl={authorizationUrl}
      onOpenChange={props.onOpenChange}
      onBeginConnect={beginConnect}
      onRetryConnectionStatus={async () => {
        await statusQuery.refetch();
      }}
      onOpenAuthorization={async () => {
        if (!authorizationUrl) throw new Error("Start the X connection again.");
        await ensureNativeApi().shell.openExternal(authorizationUrl);
      }}
      onPost={(text) => ensureNativeApi().x.createPost({ text })}
      onOpenPost={(url) => ensureNativeApi().shell.openExternal(url)}
    />
  );
}
