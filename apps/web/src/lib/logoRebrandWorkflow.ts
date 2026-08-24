import type {
  BrandingApplicationScope,
  BrandingAssetIdentity,
  BrandingImplementationBrief,
  BrandingInspectionResult,
} from "@forkara/contracts";

export const LOGO_REBRAND_STEPS = [
  "inspect",
  "source",
  "preview",
  "scope",
  "brief",
  "running",
] as const;
export type LogoRebrandStep = (typeof LOGO_REBRAND_STEPS)[number];

export type LogoRebrandEvent =
  | { readonly type: "inspection-ready" }
  | { readonly type: "asset-selected" }
  | { readonly type: "scope-selected" }
  | { readonly type: "brief-approved" }
  | { readonly type: "back" };

export function nextLogoRebrandStep(
  step: LogoRebrandStep,
  event: LogoRebrandEvent,
): LogoRebrandStep {
  if (event.type === "back") {
    const index = LOGO_REBRAND_STEPS.indexOf(step);
    return LOGO_REBRAND_STEPS[Math.max(0, index - 1)] ?? "inspect";
  }
  if (step === "inspect" && event.type === "inspection-ready") return "source";
  if (step === "source" && event.type === "asset-selected") return "preview";
  if (step === "preview" && event.type === "scope-selected") return "scope";
  if (step === "scope" && event.type === "scope-selected") return "brief";
  if (step === "brief" && event.type === "brief-approved") return "running";
  return step;
}

export interface LogoGenerationPromptInput {
  readonly projectName: string;
  readonly description: string;
  readonly styleKeywords: string;
  readonly colorDirection: string;
  readonly variant: "icon" | "wordmark" | "both";
  readonly background: "light" | "dark" | "both";
}

export function buildLogoGenerationPrompt(input: LogoGenerationPromptInput): string {
  const details = [
    `Project: ${input.projectName.trim()}`,
    input.description.trim() ? `Product description: ${input.description.trim()}` : null,
    input.styleKeywords.trim() ? `Style: ${input.styleKeywords.trim()}` : null,
    input.colorDirection.trim() ? `Color direction: ${input.colorDirection.trim()}` : null,
    `Requested variant: ${input.variant}`,
    `Background preference: ${input.background}`,
  ].filter((line): line is string => line !== null);
  return [
    "Generate one polished project logo using the configured image-generation tool.",
    "This is an asset-generation-only turn. Do not edit, create, delete, or rename any repository files, and do not run repository commands.",
    "Return the generated image as an image_generation artifact. Preserve its native raster format; do not claim it is SVG or vector output.",
    "Do not invent extra variants beyond the request.",
    "",
    ...details,
  ].join("\n");
}

export function buildBrandingImplementationBrief(input: {
  readonly inspection: BrandingInspectionResult;
  readonly asset: BrandingAssetIdentity;
  readonly scopes: readonly BrandingApplicationScope[];
  readonly instructions: string;
}): BrandingImplementationBrief {
  const scopes = input.scopes.length > 0 ? input.scopes : (["web-ui"] as const);
  const intendedUses = input.inspection.locations
    .filter((location) => location.automatic)
    .map((location) => location.kind);
  return {
    projectId: input.inspection.projectId,
    canonicalCwd: input.inspection.canonicalCwd,
    asset: input.asset,
    variantMapping: [
      {
        variant: "primary",
        assetName: input.asset.originalName,
        intendedUses: [...new Set(intendedUses)],
      },
    ],
    scopes: [scopes[0]!, ...scopes.slice(1)],
    discoveredLocations: input.inspection.locations,
    exclusions: input.inspection.exclusions,
    attributionGuardrails: input.inspection.attributionGuardrails,
    instructions: input.instructions.trim(),
  };
}

export function formatBrandingImplementationPrompt(brief: BrandingImplementationBrief): string {
  const locationLines = brief.discoveredLocations.map(
    (location) => `- ${location.path} (${location.kind}; ${location.reason})`,
  );
  const exclusionLines = brief.exclusions.map((entry) => `- ${entry}`);
  return [
    "Apply the reviewed logo rebrand brief below to this project.",
    "Use the attached immutable source asset as the only supplied brand mark. Preserve SVG as SVG and preserve aspect ratio. Do not trace raster artwork or claim it is vector.",
    "Inspect each proposed location before editing, avoid duplicate asset copies, and keep changes bounded to the selected scopes.",
    "Preserve all license, copyright, NOTICE, provenance, historical references, required upstream attribution, and compatibility identifiers.",
    "Do not commit or merge automatically. Stop after implementation and focused validation so the user can review the normal Forkara diff.",
    "",
    `Asset: ${brief.asset.originalName} (${brief.asset.nativeFormat}, ${brief.asset.source}, immutable managed attachment ${brief.asset.attachment.id})`,
    `Scopes: ${brief.scopes.join(", ")}`,
    brief.instructions ? `Additional instructions: ${brief.instructions}` : null,
    "",
    "Discovered branding locations:",
    ...(locationLines.length > 0
      ? locationLines
      : ["- No automatic locations were identified; inspect the repository before editing."]),
    "",
    "Protected exclusions:",
    ...(exclusionLines.length > 0
      ? exclusionLines
      : ["- No named files were discovered; guardrails still apply."]),
    "",
    "Attribution guardrails:",
    ...brief.attributionGuardrails.map((guardrail) => `- ${guardrail}`),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
