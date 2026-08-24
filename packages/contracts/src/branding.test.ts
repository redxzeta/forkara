import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  BrandingGenerationResult,
  BrandingImplementationBrief,
  BrandingInspectionResult,
} from "./branding";

describe("branding contracts", () => {
  it("decodes a bounded read-only inspection result", () => {
    const decoded = Schema.decodeUnknownSync(BrandingInspectionResult)({
      projectId: "project-1",
      canonicalCwd: "/repo",
      projectName: "Example",
      locations: [
        {
          path: "public/logo.svg",
          kind: "logo",
          confidence: "high",
          automatic: true,
          reason: "Logo asset",
        },
      ],
      exclusions: ["LICENSE"],
      attributionGuardrails: ["Preserve attribution."],
      truncated: false,
    });
    expect(decoded.locations[0]?.path).toBe("public/logo.svg");
  });

  it("keeps generated raster output labeled as raster", () => {
    const decoded = Schema.decodeUnknownSync(BrandingGenerationResult)({
      status: "ready",
      artifacts: [
        {
          path: "/tmp/generated.png",
          name: "generated.png",
          mimeType: "image/png",
          format: "png",
        },
      ],
    });
    expect(decoded.status).toBe("ready");
    if (decoded.status === "ready") expect(decoded.artifacts[0].format).toBe("png");
  });

  it("requires an immutable managed asset and non-empty scope in the handoff brief", () => {
    expect(() =>
      Schema.decodeUnknownSync(BrandingImplementationBrief)({
        projectId: "project-1",
        canonicalCwd: "/repo",
        asset: {
          source: "upload",
          attachment: {
            type: "image",
            id: "att_v2_abc",
            name: "logo.svg",
            mimeType: "image/svg+xml",
            sizeBytes: 42,
          },
          nativeFormat: "svg",
          originalName: "logo.svg",
          immutable: false,
        },
        variantMapping: [],
        scopes: [],
        discoveredLocations: [],
        exclusions: [],
        attributionGuardrails: [],
        instructions: "",
      }),
    ).toThrow();
  });
});
