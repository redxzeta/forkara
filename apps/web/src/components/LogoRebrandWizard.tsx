import type {
  BrandingApplicationScope,
  BrandingAssetIdentity,
  BrandingGeneratedArtifact,
  BrandingGenerationCapability,
  BrandingGenerationResult,
  BrandingImplementationBrief,
  BrandingInspectionResult,
  ModelSelection,
  ProjectId,
  ThreadId,
  UploadChatAttachment,
} from "@forkara/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildBrandingImplementationBrief,
  buildLogoGenerationPrompt,
  formatBrandingImplementationPrompt,
  type LogoRebrandStep,
} from "~/lib/logoRebrandWorkflow";
import { startLogoGenerationThread } from "~/lib/logoRebrandDispatch";
import {
  cancelManagedAttachments,
  prepareComposerImageAttachmentsFromFiles,
  stageUploadComposerAttachments,
  type StagedComposerAttachments,
} from "~/lib/composerSend";
import { newCommandId, newMessageId, newThreadId } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";

import { GeneratedMarkdownImage } from "./chat/GeneratedMarkdownImage";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

const SCOPES: ReadonlyArray<{ value: BrandingApplicationScope; label: string }> = [
  { value: "web-ui", label: "Web UI" },
  { value: "desktop", label: "Desktop app" },
  { value: "favicons-manifests", label: "Favicons and manifests" },
  { value: "social-assets", label: "Social assets" },
  { value: "documentation", label: "Documentation" },
  { value: "tests-snapshots", label: "Tests and snapshots" },
];

interface SelectedAsset {
  readonly identity: BrandingAssetIdentity;
  readonly preview:
    | { readonly kind: "upload"; readonly url: string }
    | {
        readonly kind: "generated";
        readonly path: string;
      };
}

interface AssetLifecycle {
  readonly cleanup: () => Promise<void>;
  readonly commit: () => void;
  readonly staged?: StagedComposerAttachments;
}

export interface LogoRebrandWizardProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly cwd: string;
  readonly modelSelection: ModelSelection;
  readonly generationModelSelection: ModelSelection;
}

function assetFormat(name: string, mimeType: string): BrandingAssetIdentity["nativeFormat"] {
  const normalizedName = name.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();
  if (normalizedMime === "image/svg+xml" || normalizedName.endsWith(".svg")) return "svg";
  if (normalizedMime === "image/png" || normalizedName.endsWith(".png")) return "png";
  if (normalizedMime === "image/jpeg" || /\.jpe?g$/u.test(normalizedName)) return "jpeg";
  if (normalizedMime === "image/webp" || normalizedName.endsWith(".webp")) return "webp";
  return "other-raster";
}

function briefSummary(brief: BrandingImplementationBrief): string {
  return [
    `${brief.discoveredLocations.length} branding location${brief.discoveredLocations.length === 1 ? "" : "s"} discovered`,
    `${brief.scopes.length} application scope${brief.scopes.length === 1 ? "" : "s"} selected`,
    `${brief.exclusions.length} protected file${brief.exclusions.length === 1 ? "" : "s"}`,
  ].join(" · ");
}

export function LogoRebrandWizard(props: LogoRebrandWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<LogoRebrandStep>("inspect");
  const [inspection, setInspection] = useState<BrandingInspectionResult | null>(null);
  const [capability, setCapability] = useState<BrandingGenerationCapability | null>(null);
  const [applicationThreadId, setApplicationThreadId] = useState<ThreadId>(() => newThreadId());
  const [generationThreadId, setGenerationThreadId] = useState<ThreadId | null>(null);
  const [generationResult, setGenerationResult] = useState<BrandingGenerationResult | null>(null);
  const [asset, setAsset] = useState<SelectedAsset | null>(null);
  const [scopes, setScopes] = useState<BrandingApplicationScope[]>([
    "web-ui",
    "favicons-manifests",
  ]);
  const [instructions, setInstructions] = useState("");
  const [description, setDescription] = useState("");
  const [styleKeywords, setStyleKeywords] = useState("");
  const [colorDirection, setColorDirection] = useState("");
  const [variant, setVariant] = useState<"icon" | "wordmark" | "both">("both");
  const [background, setBackground] = useState<"light" | "dark" | "both">("both");
  const [rawPrompt, setRawPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifecycleRef = useRef<AssetLifecycle | null>(null);
  const appliedRef = useRef(false);

  const reset = useCallback(() => {
    void lifecycleRef.current?.cleanup();
    lifecycleRef.current = null;
    appliedRef.current = false;
    setStep("inspect");
    setInspection(null);
    setCapability(null);
    setApplicationThreadId(newThreadId());
    setGenerationThreadId(null);
    setGenerationResult(null);
    setAsset(null);
    setScopes(["web-ui", "favicons-manifests"]);
    setInstructions("");
    setDescription("");
    setStyleKeywords("");
    setColorDirection("");
    setVariant("both");
    setBackground("both");
    setRawPrompt("");
    setBusy(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!props.open) return;
    reset();
    const api = readNativeApi();
    if (!api?.branding) {
      setError("The app server is unavailable.");
      return;
    }
    let cancelled = false;
    setBusy(true);
    void Promise.all([
      api.branding.inspect({ projectId: props.projectId, cwd: props.cwd }),
      api.branding.getGenerationCapability({ provider: props.generationModelSelection.provider }),
    ])
      .then(([nextInspection, nextCapability]) => {
        if (cancelled) return;
        setInspection(nextInspection);
        setCapability(nextCapability);
        setDescription(`A logo for ${props.projectName}.`);
        setRawPrompt(
          buildLogoGenerationPrompt({
            projectName: props.projectName,
            description: `A logo for ${props.projectName}.`,
            styleKeywords: "",
            colorDirection: "",
            variant: "both",
            background: "both",
          }),
        );
        setStep("source");
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Inspection failed.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.cwd,
    props.generationModelSelection.provider,
    props.open,
    props.projectId,
    props.projectName,
    reset,
  ]);

  useEffect(() => {
    return () => {
      if (!appliedRef.current) void lifecycleRef.current?.cleanup();
    };
  }, []);

  useEffect(() => {
    if (
      !generationThreadId ||
      generationResult?.status === "ready" ||
      generationResult?.status === "failed"
    ) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const api = readNativeApi();
      if (!api?.branding) return;
      const result = await api.branding.getGenerationResult({ generationThreadId });
      if (!cancelled) setGenerationResult(result);
    };
    void poll().catch((cause) => {
      if (!cancelled)
        setError(cause instanceof Error ? cause.message : "Could not read generation result.");
    });
    const timer = window.setInterval(() => {
      void poll().catch(() => undefined);
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [generationResult?.status, generationThreadId]);

  const updateRawPrompt = useCallback(() => {
    setRawPrompt(
      buildLogoGenerationPrompt({
        projectName: props.projectName,
        description,
        styleKeywords,
        colorDirection,
        variant,
        background,
      }),
    );
  }, [background, colorDirection, description, props.projectName, styleKeywords, variant]);

  const selectUpload = async (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!(lowerName.endsWith(".svg") || lowerName.endsWith(".png"))) {
      setError("Choose an SVG or PNG logo. SVG is preserved without rasterization.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await lifecycleRef.current?.cleanup();
      const normalizedFile = file.type
        ? file
        : new File([file], file.name, {
            type: lowerName.endsWith(".svg") ? "image/svg+xml" : "image/png",
            lastModified: file.lastModified,
          });
      const prepared = await prepareComposerImageAttachmentsFromFiles({
        files: [normalizedFile],
        existingAttachmentCount: 0,
      });
      if (prepared.error || !prepared.images[0]) {
        throw new Error(prepared.error ?? "The logo could not be prepared.");
      }
      const staged = await stageUploadComposerAttachments({
        threadId: applicationThreadId,
        images: prepared.images,
        assistantSelections: [],
      });
      const attachment = staged.attachments[0];
      if (!attachment || attachment.type !== "image") {
        await staged.cleanup();
        throw new Error("The uploaded logo was not stored as an image.");
      }
      const previewUrl = prepared.images[0].previewUrl;
      lifecycleRef.current = {
        cleanup: async () => {
          URL.revokeObjectURL(previewUrl);
          await staged.cleanup();
        },
        commit: () => {
          URL.revokeObjectURL(previewUrl);
          staged.commit();
        },
        staged,
      };
      setAsset({
        identity: {
          source: "upload",
          attachment,
          nativeFormat: assetFormat(attachment.name, attachment.mimeType),
          originalName: attachment.name,
          immutable: true,
        },
        preview: { kind: "upload", url: previewUrl },
      });
      setStep("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Logo upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const startGeneration = async () => {
    const api = readNativeApi();
    if (!api || capability?.supported !== true) return;
    setBusy(true);
    setError(null);
    try {
      const threadId = await startLogoGenerationThread({
        api: api.orchestration,
        projectId: props.projectId,
        projectName: props.projectName,
        modelSelection: props.generationModelSelection,
        prompt: rawPrompt,
      });
      setGenerationThreadId(threadId);
      setGenerationResult({ status: "pending" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Logo generation could not start.");
    } finally {
      setBusy(false);
    }
  };

  const selectGeneratedArtifact = async (artifact: BrandingGeneratedArtifact, index: number) => {
    const api = readNativeApi();
    if (!api?.branding || !generationThreadId) return;
    setBusy(true);
    setError(null);
    try {
      await lifecycleRef.current?.cleanup();
      const imported = await api.branding.importGeneratedAsset({
        generationThreadId,
        applicationThreadId,
        artifactIndex: index,
      });
      lifecycleRef.current = {
        cleanup: () => cancelManagedAttachments([imported.attachment.id]),
        commit: () => undefined,
      };
      setAsset({
        identity: {
          source: "generated",
          attachment: imported.attachment,
          nativeFormat: imported.source.format,
          originalName: imported.source.name,
          immutable: true,
        },
        preview: { kind: "generated", path: artifact.path },
      });
      setStep("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generated logo import failed.");
    } finally {
      setBusy(false);
    }
  };

  const brief = useMemo(() => {
    if (!inspection || !asset) return null;
    return buildBrandingImplementationBrief({
      inspection,
      asset: asset.identity,
      scopes,
      instructions,
    });
  }, [asset, inspection, instructions, scopes]);

  const runApplication = async () => {
    const api = readNativeApi();
    if (!api || !brief || !asset) return;
    setBusy(true);
    setError(null);
    const createdAt = new Date().toISOString();
    let created = false;
    let started = false;
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId: applicationThreadId,
        projectId: props.projectId,
        title: `Rebrand logo: ${props.projectName}`,
        modelSelection: props.modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        envMode: "worktree",
        branch: null,
        worktreePath: null,
        createdAt,
      });
      created = true;
      const dispatch = (attachments: UploadChatAttachment[]) =>
        api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: applicationThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: formatBrandingImplementationPrompt(brief),
            attachments,
          },
          modelSelection: props.modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          dispatchMode: "queue",
          createdAt,
        });
      const staged = lifecycleRef.current?.staged;
      if (staged) {
        await staged.runWithDispatch(dispatch);
      } else {
        await dispatch([asset.identity.attachment]);
      }
      lifecycleRef.current?.commit();
      started = true;
      appliedRef.current = true;
      setStep("running");
      props.onOpenChange(false);
      await navigate({ to: "/$threadId", params: { threadId: applicationThreadId } });
    } catch (cause) {
      if (created && !started) {
        await api.orchestration
          .dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: applicationThreadId,
          })
          .catch(() => undefined);
        await lifecycleRef.current?.cleanup();
        lifecycleRef.current = null;
        setAsset(null);
        setApplicationThreadId(newThreadId());
        setStep("source");
      }
      setError(
        started
          ? "The rebrand agent started, but Forkara could not open its thread. Find it in the project sidebar."
          : cause instanceof Error
            ? `${cause.message}${created ? " Choose the logo again before retrying." : ""}`
            : `The rebrand agent could not start.${created ? " Choose the logo again before retrying." : ""}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !appliedRef.current) void lifecycleRef.current?.cleanup();
    props.onOpenChange(open);
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogPopup className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rebrand logo</DialogTitle>
          <DialogDescription>
            Inspect, select, and review first. Repository changes begin only when you run the agent.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-wrap gap-1.5 text-xs text-muted-foreground"
          aria-label="Workflow progress"
        >
          {(["inspect", "source", "preview", "scope", "brief", "running"] as const).map(
            (item, index) => (
              <span
                key={item}
                aria-current={item === step ? "step" : undefined}
                className={
                  item === step
                    ? "rounded-full bg-foreground px-2 py-1 text-background"
                    : "rounded-full bg-muted px-2 py-1"
                }
              >
                {index + 1}. {item === "brief" ? "review" : item}
              </span>
            ),
          )}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        {busy && step === "inspect" ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Inspecting project branding…
          </p>
        ) : null}

        {step === "source" && inspection ? (
          <div className="space-y-5">
            <div className="rounded-xl border p-4">
              <p className="font-medium">Inspection complete</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Found {inspection.locations.length} possible branding location
                {inspection.locations.length === 1 ? "" : "s"}. Protected attribution files are
                excluded by default.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="space-y-3 rounded-xl border p-4">
                <div>
                  <h3 className="font-medium">Use an existing logo</h3>
                  <p className="text-sm text-muted-foreground">SVG stays SVG. PNG stays raster.</p>
                </div>
                <Input
                  type="file"
                  accept=".svg,.png,image/svg+xml,image/png"
                  aria-label="Choose SVG or PNG logo"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void selectUpload(file);
                  }}
                />
              </section>
              <section className="space-y-3 rounded-xl border p-4">
                <div>
                  <h3 className="font-medium">Generate a logo</h3>
                  <p className="text-sm text-muted-foreground">
                    {capability?.supported
                      ? `Uses ${capability.provider}'s image_generation path.`
                      : (capability?.reason ?? "Checking provider capability…")}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="logo-description">Description</Label>
                  <Input
                    id="logo-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    onBlur={updateRawPrompt}
                  />
                  <Label htmlFor="logo-style">Style keywords</Label>
                  <Input
                    id="logo-style"
                    value={styleKeywords}
                    onChange={(event) => setStyleKeywords(event.target.value)}
                    onBlur={updateRawPrompt}
                    placeholder="minimal, geometric, calm"
                  />
                  <Label htmlFor="logo-colors">Color direction</Label>
                  <Input
                    id="logo-colors"
                    value={colorDirection}
                    onChange={(event) => setColorDirection(event.target.value)}
                    onBlur={updateRawPrompt}
                    placeholder="indigo and warm white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-muted-foreground">
                      Variant
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                        value={variant}
                        onChange={(event) => {
                          const nextVariant = event.target.value as typeof variant;
                          setVariant(nextVariant);
                          setRawPrompt(
                            buildLogoGenerationPrompt({
                              projectName: props.projectName,
                              description,
                              styleKeywords,
                              colorDirection,
                              variant: nextVariant,
                              background,
                            }),
                          );
                        }}
                      >
                        <option value="icon">Icon only</option>
                        <option value="wordmark">Wordmark</option>
                        <option value="both">Both</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Background
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                        value={background}
                        onChange={(event) => {
                          const nextBackground = event.target.value as typeof background;
                          setBackground(nextBackground);
                          setRawPrompt(
                            buildLogoGenerationPrompt({
                              projectName: props.projectName,
                              description,
                              styleKeywords,
                              colorDirection,
                              variant,
                              background: nextBackground,
                            }),
                          );
                        }}
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="both">Both</option>
                      </select>
                    </label>
                  </div>
                  <Label htmlFor="logo-raw-prompt">Generation prompt</Label>
                  <Textarea
                    id="logo-raw-prompt"
                    rows={7}
                    value={rawPrompt}
                    onChange={(event) => setRawPrompt(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    capability?.supported !== true ||
                    rawPrompt.trim().length === 0 ||
                    generationResult?.status === "pending" ||
                    generationResult?.status === "running"
                  }
                  onClick={() => void startGeneration()}
                >
                  Generate without changing files
                </Button>
                {generationResult ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {generationResult.status === "running" || generationResult.status === "pending"
                      ? "Generating in a normal provider thread…"
                      : generationResult.status === "failed"
                        ? generationResult.message
                        : "Generation complete. Select a result below."}
                  </p>
                ) : null}
              </section>
            </div>
            {generationResult?.status === "ready" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {generationResult.artifacts.map((artifact, index) => (
                  <button
                    key={artifact.path}
                    type="button"
                    className="rounded-xl border p-3 text-left hover:border-foreground/40"
                    onClick={() => void selectGeneratedArtifact(artifact, index)}
                  >
                    <GeneratedMarkdownImage
                      src={artifact.path}
                      alt={`Generated logo ${index + 1}`}
                      cwd={undefined}
                    />
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {artifact.format} · select this immutable result
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "preview" && asset ? (
          <div className="space-y-4">
            <div className="mx-auto max-w-md rounded-2xl border bg-[linear-gradient(135deg,#fff_0_50%,#161616_50%)] p-6">
              {asset.preview.kind === "upload" ? (
                <img
                  src={asset.preview.url}
                  alt="Selected logo preview"
                  className="mx-auto max-h-64 max-w-full object-contain"
                />
              ) : (
                <GeneratedMarkdownImage
                  src={asset.preview.path}
                  alt="Selected generated logo"
                  cwd={undefined}
                />
              )}
            </div>
            <div className="rounded-xl border p-4 text-sm">
              <p className="font-medium">{asset.identity.originalName}</p>
              <p className="text-muted-foreground">
                {asset.identity.nativeFormat} · {asset.identity.source} · immutable managed asset
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("source")}>
                Choose another
              </Button>
              <Button onClick={() => setStep("scope")}>Choose application scope</Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "scope" && inspection ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {SCOPES.map((scope) => (
                <label
                  key={scope.value}
                  className="flex items-center gap-3 rounded-xl border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.value)}
                    onChange={(event) =>
                      setScopes((current) =>
                        event.target.checked
                          ? [...current, scope.value]
                          : current.filter((value) => value !== scope.value),
                      )
                    }
                  />
                  {scope.label}
                </label>
              ))}
            </div>
            <div>
              <Label htmlFor="rebrand-instructions">Exclusions or implementation notes</Label>
              <Textarea
                id="rebrand-instructions"
                rows={4}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Optional: keep the monochrome footer mark unchanged."
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border p-3 text-xs text-muted-foreground">
              {inspection.locations.map((location) => (
                <p key={location.path}>
                  {location.path} · {location.kind}
                </p>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("preview")}>
                Back
              </Button>
              <Button disabled={scopes.length === 0} onClick={() => setStep("brief")}>
                Review brief
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "brief" && brief ? (
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <h3 className="font-medium">Bounded agent handoff</h3>
              <p className="mt-1 text-sm text-muted-foreground">{briefSummary(brief)}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                <li>Generation and application remain separate actions.</li>
                <li>The source asset is attached without rewriting its native format.</li>
                <li>
                  License, NOTICE, copyright, provenance, and upstream attribution remain protected.
                </li>
                <li>The agent runs in the normal worktree and diff-review workflow.</li>
              </ul>
            </div>
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Review exact agent prompt
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {formatBrandingImplementationPrompt(brief)}
              </pre>
            </details>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("scope")}>
                Back
              </Button>
              <Button disabled={busy} onClick={() => void runApplication()}>
                Run rebrand agent
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
