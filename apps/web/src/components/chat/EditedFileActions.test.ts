// FILE: EditedFileActions.test.ts
// Purpose: Pins safe relative/absolute path resolution for edited-file actions.

import { describe, expect, it } from "vitest";

import { resolveEditedFilePaths } from "./EditedFileActions";

describe("resolveEditedFilePaths", () => {
  it("derives both path forms for a workspace-relative file", () => {
    expect(resolveEditedFilePaths("src/app.ts", "/repo/project")).toEqual({
      relativePath: "src/app.ts",
      absolutePath: "/repo/project/src/app.ts",
    });
  });

  it("keeps an outside absolute file absolute without inventing a relative path", () => {
    expect(resolveEditedFilePaths("/tmp/output.txt", "/repo/project")).toEqual({
      relativePath: null,
      absolutePath: "/tmp/output.txt",
    });
  });

  it("rejects unsafe relative paths", () => {
    expect(resolveEditedFilePaths("../secret.txt", "/repo/project")).toEqual({
      relativePath: null,
      absolutePath: null,
    });
  });
});
