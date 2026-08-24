import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { DependencyCleanupPreview, DependencyCleanupResult } from "./resetDepartment";

describe("Reset Department contracts", () => {
  it("decodes exact dependency cleanup previews and results", () => {
    const preview = {
      workspaceRoot: "/workspace",
      targetPath: "/workspace/node_modules",
      state: "ready",
      packageManager: "bun",
      installCommand: "bun install",
    } as const;

    expect(Schema.decodeUnknownSync(DependencyCleanupPreview)(preview)).toEqual(preview);
    expect(
      Schema.decodeUnknownSync(DependencyCleanupResult)({ ...preview, removed: true }),
    ).toEqual({ ...preview, removed: true });
  });
});
