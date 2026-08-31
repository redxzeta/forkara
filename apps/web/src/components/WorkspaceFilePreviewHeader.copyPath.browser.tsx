// FILE: WorkspaceFilePreviewHeader.copyPath.browser.tsx
// Purpose: Verifies preview path-copy labels and actions for workspace and external files.
// Layer: Focused browser component test

import "../index.css";

import { page } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const harness = vi.hoisted(() => ({
  copyPath: vi.fn(),
}));

vi.mock("../hooks/useCopyToClipboard", () => ({
  useCopyFileContentsToClipboard: () => vi.fn(),
  useCopyPathToClipboard: () => harness.copyPath,
}));

vi.mock("./chat/OpenInPicker", () => ({
  OpenInPicker: () => <button type="button">Open</button>,
}));

import { WorkspaceFilePreviewHeader } from "./chat/WorkspaceFilePreviewHeader";

beforeEach(() => {
  harness.copyPath.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

function renderHeader(filePath: string) {
  return render(
    <WorkspaceFilePreviewHeader
      workspaceRoot="/Users/tester/project"
      filePath={filePath}
      isMarkdown={false}
      markdownPreviewEnabled={false}
      onMarkdownPreviewChange={vi.fn()}
    />,
  );
}

it("copies the relative path shown by an in-workspace preview", async () => {
  await renderHeader("src/app.ts");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Copy relative path" }).click();

  expect(harness.copyPath).toHaveBeenCalledWith("src/app.ts");
});

it("copies the absolute path shown by an out-of-workspace preview", async () => {
  await renderHeader("/tmp/agent-output/report.txt");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Copy absolute path" }).click();

  expect(harness.copyPath).toHaveBeenCalledWith("/tmp/agent-output/report.txt");
});
