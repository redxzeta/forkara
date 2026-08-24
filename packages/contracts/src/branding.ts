import { Schema } from "effect";

import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";
import { ChatImageAttachment, ProviderKind } from "./orchestration";

const BrandingPath = TrimmedNonEmptyString.check(Schema.isMaxLength(4096));

export const BrandingLocationKind = Schema.Literals([
  "logo",
  "wordmark",
  "compact-mark",
  "favicon",
  "app-icon",
  "manifest",
  "navigation",
  "onboarding",
  "social",
  "documentation",
  "test",
  "unknown",
]);
export type BrandingLocationKind = typeof BrandingLocationKind.Type;

export const BrandingLocation = Schema.Struct({
  path: BrandingPath,
  kind: BrandingLocationKind,
  confidence: Schema.Literals(["high", "medium", "low"]),
  automatic: Schema.Boolean,
  reason: TrimmedNonEmptyString.check(Schema.isMaxLength(240)),
});
export type BrandingLocation = typeof BrandingLocation.Type;

export const BrandingInspectionInput = Schema.Struct({
  projectId: ProjectId,
  cwd: BrandingPath,
});
export type BrandingInspectionInput = typeof BrandingInspectionInput.Type;

export const BrandingInspectionResult = Schema.Struct({
  projectId: ProjectId,
  canonicalCwd: BrandingPath,
  projectName: TrimmedNonEmptyString.check(Schema.isMaxLength(160)),
  locations: Schema.Array(BrandingLocation),
  exclusions: Schema.Array(BrandingPath),
  attributionGuardrails: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(320))),
  truncated: Schema.Boolean,
});
export type BrandingInspectionResult = typeof BrandingInspectionResult.Type;

export const BrandingGenerationCapabilityInput = Schema.Struct({
  provider: ProviderKind,
});
export type BrandingGenerationCapabilityInput = typeof BrandingGenerationCapabilityInput.Type;

export const BrandingGenerationCapability = Schema.Struct({
  provider: ProviderKind,
  supported: Schema.Boolean,
  reason: Schema.NullOr(TrimmedNonEmptyString.check(Schema.isMaxLength(320))),
});
export type BrandingGenerationCapability = typeof BrandingGenerationCapability.Type;

export const BrandingGeneratedArtifact = Schema.Struct({
  path: BrandingPath,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  format: Schema.Literals(["png", "svg", "jpeg", "webp", "other-raster"]),
});
export type BrandingGeneratedArtifact = typeof BrandingGeneratedArtifact.Type;

export const BrandingGenerationResultInput = Schema.Struct({
  generationThreadId: ThreadId,
});
export type BrandingGenerationResultInput = typeof BrandingGenerationResultInput.Type;

export const BrandingGenerationResult = Schema.Union([
  Schema.Struct({ status: Schema.Literals(["pending", "running"]) }),
  Schema.Struct({
    status: Schema.Literal("failed"),
    message: TrimmedNonEmptyString.check(Schema.isMaxLength(500)),
  }),
  Schema.Struct({
    status: Schema.Literal("ready"),
    artifacts: Schema.NonEmptyArray(BrandingGeneratedArtifact),
  }),
]);
export type BrandingGenerationResult = typeof BrandingGenerationResult.Type;

export const BrandingImportGeneratedAssetInput = Schema.Struct({
  generationThreadId: ThreadId,
  applicationThreadId: ThreadId,
  artifactIndex: NonNegativeInt,
});
export type BrandingImportGeneratedAssetInput = typeof BrandingImportGeneratedAssetInput.Type;

export const BrandingImportGeneratedAssetResult = Schema.Struct({
  attachment: ChatImageAttachment,
  source: BrandingGeneratedArtifact,
});
export type BrandingImportGeneratedAssetResult = typeof BrandingImportGeneratedAssetResult.Type;

export const BrandingAssetSource = Schema.Literals(["upload", "generated"]);
export type BrandingAssetSource = typeof BrandingAssetSource.Type;

export const BrandingAssetIdentity = Schema.Struct({
  source: BrandingAssetSource,
  attachment: ChatImageAttachment,
  nativeFormat: Schema.Literals(["svg", "png", "jpeg", "webp", "other-raster"]),
  originalName: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  immutable: Schema.Literal(true),
});
export type BrandingAssetIdentity = typeof BrandingAssetIdentity.Type;

export const BrandingApplicationScope = Schema.Literals([
  "web-ui",
  "desktop",
  "favicons-manifests",
  "social-assets",
  "documentation",
  "tests-snapshots",
]);
export type BrandingApplicationScope = typeof BrandingApplicationScope.Type;

export const BrandingVariantMapping = Schema.Struct({
  variant: Schema.Literals(["primary", "compact", "wordmark"]),
  assetName: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  intendedUses: Schema.Array(BrandingLocationKind),
});
export type BrandingVariantMapping = typeof BrandingVariantMapping.Type;

export const BrandingImplementationBrief = Schema.Struct({
  projectId: ProjectId,
  canonicalCwd: BrandingPath,
  asset: BrandingAssetIdentity,
  variantMapping: Schema.NonEmptyArray(BrandingVariantMapping),
  scopes: Schema.NonEmptyArray(BrandingApplicationScope),
  discoveredLocations: Schema.Array(BrandingLocation),
  exclusions: Schema.Array(BrandingPath),
  attributionGuardrails: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(320))),
  instructions: Schema.String.check(Schema.isMaxLength(8000)),
});
export type BrandingImplementationBrief = typeof BrandingImplementationBrief.Type;
