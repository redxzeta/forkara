import { forwardRef, useEffect, useRef, useState } from "react";

import { ForkaraLogo } from "~/components/ForkaraLogo";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { CopyIcon, DownloadIcon } from "~/lib/icons";
import {
  MERGE_FLEX_CARD_HEIGHT,
  MERGE_FLEX_CARD_WIDTH,
  type MergeFlexCardModel,
} from "~/lib/mergeFlexCard";
import { mergeFlexCardExporter } from "~/lib/mergeFlexCardExport";
import { cn } from "~/lib/utils";

import {
  PR_FINE_TEXT_CLASS_NAME,
  PR_META_TEXT_CLASS_NAME,
  PR_QUIET_INK_CLASS_NAME,
} from "./pullRequestText";

const PREVIEW_WIDTH = 580;

export const MergeFlexCard = forwardRef<HTMLDivElement, { readonly model: MergeFlexCardModel }>(
  function MergeFlexCard({ model }, ref) {
    const factual = model.source === "factual";
    const accent = factual ? "#67e8f9" : "#fbbf24";
    const countFontSize =
      model.countLabel.length >= 7 ? 122 : model.countLabel.length >= 5 ? 146 : 176;

    return (
      <div
        ref={ref}
        data-card-source={model.source}
        aria-label={`${model.marker}: ${model.countLabel} ${model.headline.toLowerCase()}`}
        className="relative flex h-[675px] w-[1200px] flex-col overflow-hidden bg-[#080b10] px-[72px] py-[58px] font-sans text-[#f8fafc]"
        style={{
          width: MERGE_FLEX_CARD_WIDTH,
          height: MERGE_FLEX_CARD_HEIGHT,
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: accent }}
        />
        <div
          aria-hidden
          className="absolute -right-28 -top-28 size-[420px] rounded-full opacity-[0.08] blur-3xl"
          style={{ backgroundColor: accent }}
        />

        <header className="relative flex items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-xl border border-[#334155] bg-[#111827]">
              <ForkaraLogo className="size-9" />
            </div>
            <div>
              <p className="text-[24px] font-semibold tracking-[-0.02em] text-[#f8fafc]">
                FORKARA / MERGE FLEX
              </p>
              <p className="font-mono text-[15px] tracking-[0.18em] text-[#94a3b8]">
                {factual ? "LOCAL RECEIPT CONTROL" : "RESUME-DRIVEN DEVELOPMENT"}
              </p>
            </div>
          </div>
          <div
            className="rounded-full border px-5 py-2 font-mono text-[18px] font-bold tracking-[0.12em]"
            style={{ borderColor: accent, color: accent, backgroundColor: `${accent}12` }}
          >
            {model.marker}
          </div>
        </header>

        <main className="relative mt-11 flex min-h-0 flex-1 items-end justify-between gap-12">
          <div className="min-w-0 flex-1">
            <p
              className="font-mono text-[22px] font-semibold tracking-[0.12em]"
              style={{ color: accent }}
            >
              {factual ? "GIT EVENT SUMMARY" : "SIMULATED VELOCITY REPORT"}
            </p>
            <p className="mt-3 text-[38px] font-semibold leading-[1.05] tracking-[-0.025em] text-[#cbd5e1]">
              {model.headline}
            </p>
            <p className="mt-8 font-mono text-[20px] uppercase tracking-[0.08em] text-[#94a3b8]">
              {model.date} / {model.scopeLabel}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className="font-mono font-black leading-[0.76] tracking-[-0.09em] tabular-nums"
              style={{ color: accent, fontSize: countFontSize }}
            >
              {model.countLabel}
            </p>
          </div>
        </main>

        <footer className="relative mt-12 flex items-center justify-between border-t border-[#273244] pt-6">
          <p className="text-[24px] font-medium text-[#e2e8f0]">{model.footer}</p>
          <p className="font-mono text-[15px] tracking-[0.12em] text-[#64748b]">
            LOCAL PNG / 1200×675 / NO CLOUD RENDER
          </p>
        </footer>
      </div>
    );
  },
);

export function MergeFlexShareCardPanel(props: {
  readonly model: MergeFlexCardModel | null;
  readonly disabled: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(PREVIEW_WIDTH);
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setStatus(null);
  }, [props.model]);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const update = (width: number) =>
      setPreviewWidth(Math.max(1, Math.min(PREVIEW_WIDTH, Math.floor(width))));
    update(node.clientWidth || PREVIEW_WIDTH);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      update(entries[0]?.contentRect.width ?? node.clientWidth ?? PREVIEW_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleCopy = () => {
    const node = cardRef.current;
    if (!node || !props.model || busy !== null) return Promise.resolve();
    setBusy("copy");
    setStatus(null);
    return mergeFlexCardExporter
      .copyOrDownload(node, props.model)
      .then((result) => {
        switch (result) {
          case "copied":
            setStatus({ tone: "success", text: "Copied the 1200×675 PNG to your clipboard." });
            break;
          case "downloaded":
            setStatus({
              tone: "success",
              text: "Image clipboard unavailable; downloaded the PNG instead.",
            });
            break;
          case "render-failed":
            setStatus({ tone: "error", text: "Forkara could not render the local PNG." });
            break;
        }
      })
      .finally(() => setBusy(null));
  };

  const handleDownload = () => {
    const node = cardRef.current;
    if (!node || !props.model || busy !== null) return Promise.resolve();
    setBusy("download");
    setStatus(null);
    return mergeFlexCardExporter
      .download(node, props.model)
      .then((result) => {
        setStatus(
          result === "downloaded"
            ? { tone: "success", text: "Downloaded the 1200×675 PNG." }
            : { tone: "error", text: "Forkara could not render the local PNG." },
        );
      })
      .finally(() => setBusy(null));
  };

  const previewScale = previewWidth / MERGE_FLEX_CARD_WIDTH;
  const actionsDisabled = props.disabled || props.model === null || busy !== null;

  return (
    <section
      className="space-y-3 rounded-xl border border-border/60 p-3"
      aria-label="Shareable card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>Shareable card</p>
          <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>
            Optional local PNG. The source marker is baked into the image; X posting stays
            text-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={actionsDisabled}
            onClick={() => void handleCopy()}
          >
            {busy === "copy" ? <Spinner /> : <CopyIcon className="size-3.5" />}
            Copy PNG
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={actionsDisabled}
            onClick={() => void handleDownload()}
          >
            {busy === "download" ? <Spinner /> : <DownloadIcon className="size-3.5" />}
            Download PNG
          </Button>
        </div>
      </div>

      {props.model ? (
        <div
          ref={previewRef}
          className="w-full max-w-[580px] overflow-hidden rounded-xl border border-border/70 bg-[#080b10]"
          style={{ aspectRatio: `${MERGE_FLEX_CARD_WIDTH} / ${MERGE_FLEX_CARD_HEIGHT}` }}
        >
          <div
            style={{
              width: MERGE_FLEX_CARD_WIDTH,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
            }}
          >
            <MergeFlexCard ref={cardRef} model={props.model} />
          </div>
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
          <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>
            Enter a valid alleged count to prepare the parody card.
          </p>
        </div>
      )}

      <p
        className={cn(
          PR_FINE_TEXT_CLASS_NAME,
          status?.tone === "error" ? "text-destructive" : PR_QUIET_INK_CLASS_NAME,
        )}
        role={status ? (status.tone === "error" ? "alert" : "status") : undefined}
      >
        {status?.text ?? "1200×675 PNG · rendered locally · no repository details by default"}
      </p>
    </section>
  );
}
