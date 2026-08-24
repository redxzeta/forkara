// FILE: brandingService.ts
// Purpose: Read-only project branding inventory and safe generated-asset staging.
// Layer: Server domain service

import fs from "node:fs/promises";
import path from "node:path";

import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type BrandingGeneratedArtifact,
  type BrandingGenerationResult,
  type BrandingGenerationCapability,
  type BrandingInspectionResult,
  type BrandingLocation,
  type ChatImageAttachment,
  type OrchestrationThread,
  type ProjectFileSystemEntry,
  type ProjectId,
  type ProviderComposerCapabilities,
  type ServerProviderStatus,
  type ThreadId,
} from "@forkara/contracts";
import { Effect } from "effect";

import { isCodexGeneratedImageArtifact } from "../codexGeneratedImages";
import type { ManagedAttachmentPrincipal } from "../managedAttachmentPrincipal";
import {
  persistReservedManagedAttachment,
  reserveManagedAttachmentUpload,
} from "../managedAttachmentStore";
import type { ManagedAttachmentRepositoryShape } from "../persistence/Services/ManagedAttachments";

const MAX_BRANDING_LOCATIONS = 300;

const ATTRIBUTION_GUARDRAILS = [
  "Preserve license, copyright, NOTICE, provenance, and required upstream attribution files.",
  "Do not remove historical references or rename compatibility identifiers unless explicitly requested.",
  "Keep the supplied asset in its native format; never label raster output as SVG or vector artwork.",
] as const;

const EXCLUDED_BASENAMES = new Set([
  "license",
  "license.md",
  "license.txt",
  "notice",
  "notice.md",
  "notice.txt",
  "copying",
  "copyright",
]);

export function resolveBrandingGenerationCapability(input: {
  readonly capabilities: ProviderComposerCapabilities;
  readonly status: ServerProviderStatus | null;
}): BrandingGenerationCapability {
  const { capabilities, status } = input;
  if (capabilities.supportsImageGeneration !== true) {
    return {
      provider: capabilities.provider,
      supported: false,
      reason: "This provider does not expose image_generation artifacts. Upload remains available.",
    };
  }
  if (!status?.available) {
    return {
      provider: capabilities.provider,
      supported: false,
      reason: status?.message ?? "This image-capable provider is not installed or available.",
    };
  }
  if (status.authStatus === "unauthenticated") {
    return {
      provider: capabilities.provider,
      supported: false,
      reason: "This image-capable provider must be authenticated before generation.",
    };
  }
  return { provider: capabilities.provider, supported: true, reason: null };
}

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function classifyBrandingPath(rawPath: string): BrandingLocation | null {
  const entryPath = normalizedPath(rawPath);
  const lower = entryPath.toLowerCase();
  const basename = lower.split("/").at(-1) ?? lower;
  const extension = basename.includes(".") ? (basename.split(".").at(-1) ?? "") : "";
  const imageLike = /^(?:svg|png|jpe?g|webp|gif|ico)$/u.test(extension);

  const location = (
    kind: BrandingLocation["kind"],
    confidence: BrandingLocation["confidence"],
    automatic: boolean,
    reason: string,
  ): BrandingLocation => ({ path: entryPath, kind, confidence, automatic, reason });

  if (/favicon|apple-touch-icon/u.test(basename)) {
    return location("favicon", "high", imageLike, "Filename identifies a browser icon.");
  }
  if (/manifest(?:\.webmanifest|\.json)?$/u.test(basename)) {
    return location("manifest", "high", false, "Manifest metadata may reference brand assets.");
  }
  if (/(?:app[-_]?icon|icon\.(?:icns|ico)|icons?\/)/u.test(lower)) {
    return location("app-icon", "high", imageLike, "Path identifies application icon artwork.");
  }
  if (/(?:open[-_]?graph|og[-_]?image|social[-_]?card)/u.test(lower)) {
    return location("social", "high", imageLike, "Path identifies social preview artwork.");
  }
  if (/wordmark/u.test(lower)) {
    return location("wordmark", "high", imageLike, "Path identifies a full wordmark variant.");
  }
  if (/(?:compact|mark|glyph)[-_.]/u.test(basename)) {
    return location("compact-mark", "medium", imageLike, "Filename suggests a compact mark.");
  }
  if (/logo|brand/u.test(lower)) {
    return location("logo", "high", imageLike, "Path explicitly references logo or branding.");
  }
  if (/^(?:readme|contributing)(?:\.|$)/u.test(basename) && /md|mdx/u.test(extension)) {
    return location("documentation", "medium", false, "Primary documentation may embed branding.");
  }
  if (
    /(?:header|sidebar|navigation|navbar)/u.test(lower) &&
    /tsx?|jsx?|vue|svelte/u.test(extension)
  ) {
    return location("navigation", "low", false, "UI surface may render product branding.");
  }
  if (/(?:login|onboarding|splash)/u.test(lower)) {
    return location("onboarding", "low", imageLike, "Entry surface may render product branding.");
  }
  if (/(?:snapshot|\.spec\.|\.test\.)/u.test(lower) && /logo|icon|brand/u.test(lower)) {
    return location("test", "medium", false, "Test asset may assert existing branding.");
  }
  return null;
}

export function inspectBrandingEntries(input: {
  readonly projectId: ProjectId;
  readonly canonicalCwd: string;
  readonly projectName: string;
  readonly entries: ReadonlyArray<ProjectFileSystemEntry>;
}): BrandingInspectionResult {
  const exclusions = input.entries
    .filter((entry) => entry.kind === "file")
    .map((entry) => normalizedPath(entry.path))
    .filter((entryPath) => EXCLUDED_BASENAMES.has(entryPath.toLowerCase().split("/").at(-1) ?? ""))
    .toSorted();
  const discovered = input.entries
    .filter((entry) => entry.kind === "file")
    .flatMap((entry) => {
      const location = classifyBrandingPath(entry.path);
      return location ? [location] : [];
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));
  const locations = discovered.slice(0, MAX_BRANDING_LOCATIONS);
  return {
    projectId: input.projectId,
    canonicalCwd: input.canonicalCwd,
    projectName: input.projectName,
    locations,
    exclusions,
    attributionGuardrails: [...ATTRIBUTION_GUARDRAILS],
    truncated: discovered.length > locations.length,
  };
}

function generatedArtifactFromPath(imagePath: string): BrandingGeneratedArtifact {
  const extension = path.extname(imagePath).toLowerCase();
  const format =
    extension === ".svg"
      ? "svg"
      : extension === ".png"
        ? "png"
        : extension === ".jpg" || extension === ".jpeg"
          ? "jpeg"
          : extension === ".webp"
            ? "webp"
            : "other-raster";
  const mimeType =
    format === "svg"
      ? "image/svg+xml"
      : format === "png"
        ? "image/png"
        : format === "jpeg"
          ? "image/jpeg"
          : format === "webp"
            ? "image/webp"
            : "image/octet-stream";
  return {
    path: imagePath,
    name: path.basename(imagePath),
    mimeType,
    format,
  };
}

export function brandingGenerationResultFromThread(
  thread: OrchestrationThread | null,
): BrandingGenerationResult {
  if (!thread) return { status: "pending" };
  const artifacts = thread.activities
    .filter((activity) => activity.kind === "tool.completed")
    .flatMap((activity) => {
      const payload = activity.payload as { readonly itemType?: unknown; readonly data?: unknown };
      return payload.itemType === "image_generation" && isCodexGeneratedImageArtifact(payload.data)
        ? [generatedArtifactFromPath(payload.data.path)]
        : [];
    })
    .filter(
      (artifact, index, all) =>
        all.findIndex((candidate) => candidate.path === artifact.path) === index,
    );
  if (artifacts.length > 0)
    return { status: "ready", artifacts: [artifacts[0]!, ...artifacts.slice(1)] };
  if (thread.latestTurn?.state === "error") {
    return { status: "failed", message: "Image generation failed in the provider thread." };
  }
  if (thread.latestTurn?.state === "completed" || thread.latestTurn?.state === "interrupted") {
    return {
      status: "failed",
      message: "The provider turn finished without returning an image_generation artifact.",
    };
  }
  return thread.latestTurn?.state === "running" ? { status: "running" } : { status: "pending" };
}

export function stageGeneratedBrandingAsset(input: {
  readonly source: BrandingGeneratedArtifact;
  readonly resolvedPath: string;
  readonly applicationThreadId: ThreadId;
  readonly attachmentsDir: string;
  readonly principal: ManagedAttachmentPrincipal;
  readonly repository: ManagedAttachmentRepositoryShape;
}): Effect.Effect<ChatImageAttachment, Error> {
  return Effect.gen(function* () {
    const bytes = yield* Effect.tryPromise(() => fs.readFile(input.resolvedPath));
    if (bytes.byteLength === 0 || bytes.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
      return yield* Effect.fail(new Error("Generated image is empty or exceeds the image limit."));
    }
    const now = new Date().toISOString();
    const reservation = yield* reserveManagedAttachmentUpload({
      type: "image",
      threadId: input.applicationThreadId,
      name: input.source.name,
      mimeType: input.source.mimeType,
      reservedBytes: bytes.byteLength,
      now,
      principal: input.principal,
      repository: input.repository,
    });
    const attachment = yield* persistReservedManagedAttachment({
      reservation,
      bytes,
      attachmentsDir: input.attachmentsDir,
      now: new Date().toISOString(),
      principal: input.principal,
      repository: input.repository,
    });
    if (attachment.type !== "image") {
      return yield* Effect.fail(new Error("Generated branding asset was not stored as an image."));
    }
    return attachment;
  });
}
