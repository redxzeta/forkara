import { describe, expect, it } from "vitest";

import {
  buildBrandingImplementationBrief,
  buildLogoGenerationPrompt,
  formatBrandingImplementationPrompt,
  nextLogoRebrandStep,
} from "./logoRebrandWorkflow";

const inspection = {
  projectId: "project-1" as never,
  canonicalCwd: "/repo",
  projectName: "Example",
  locations: [
    {
      path: "public/logo.svg",
      kind: "logo" as const,
      confidence: "high" as const,
      automatic: true,
      reason: "Logo asset",
    },
  ],
  exclusions: ["LICENSE"],
  attributionGuardrails: ["Preserve attribution."],
  truncated: false,
};

const asset = {
  source: "upload" as const,
  attachment: {
    type: "image" as const,
    id: "att_v2_abc",
    name: "logo.svg",
    mimeType: "image/svg+xml",
    sizeBytes: 42,
  },
  nativeFormat: "svg" as const,
  originalName: "logo.svg",
  immutable: true as const,
};

describe("logo rebrand workflow", () => {
  it("does not skip explicit selection, scope, or review states", () => {
    expect(nextLogoRebrandStep("inspect", { type: "inspection-ready" })).toBe("source");
    expect(nextLogoRebrandStep("source", { type: "brief-approved" })).toBe("source");
    expect(nextLogoRebrandStep("source", { type: "asset-selected" })).toBe("preview");
    expect(nextLogoRebrandStep("brief", { type: "brief-approved" })).toBe("running");
  });

  it("constrains generation to an artifact-only turn with no repository mutation", () => {
    const prompt = buildLogoGenerationPrompt({
      projectName: "Example",
      description: "Developer tool",
      styleKeywords: "geometric",
      colorDirection: "indigo",
      variant: "icon",
      background: "dark",
    });
    expect(prompt).toContain("Do not edit, create, delete, or rename any repository files");
    expect(prompt).toContain("image_generation artifact");
    expect(prompt).toContain("Requested variant: icon");
  });

  it("builds a bounded handoff with source identity, scope, exclusions, and attribution", () => {
    const brief = buildBrandingImplementationBrief({
      inspection,
      asset,
      scopes: ["web-ui"],
      instructions: "Keep the footer unchanged.",
    });
    const prompt = formatBrandingImplementationPrompt(brief);
    expect(brief.asset).toBe(asset);
    expect(brief.scopes).toEqual(["web-ui"]);
    expect(prompt).toContain("public/logo.svg");
    expect(prompt).toContain("LICENSE");
    expect(prompt).toContain("Preserve attribution.");
    expect(prompt).toContain("Do not commit or merge automatically");
  });
});
