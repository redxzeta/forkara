// FILE: WorkspaceFilePreview.find.browser.tsx
// Purpose: Browser coverage for scoped active-file find, navigation, refresh, and reset.
// Layer: Focused component integration tests

import "../index.css";

import type { NativeApi, ProjectReadFileResult } from "@forkara/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { projectReadFileQueryOptions } from "../lib/projectReactQuery";
import { WorkspaceFilePreview } from "./WorkspaceFilePreview";

const WORKSPACE_ROOT = "/Users/tester/project";
const FILE_PATH = "src/app.ts";
const VERSION = `sha256:${"1".repeat(64)}`;

function installNativeApi(api: NativeApi): () => void {
  const previousDescriptor = Object.getOwnPropertyDescriptor(window, "nativeApi");
  Object.defineProperty(window, "nativeApi", {
    configurable: true,
    value: api,
  });
  return () => {
    if (previousDescriptor) {
      Object.defineProperty(window, "nativeApi", previousDescriptor);
    } else {
      Reflect.deleteProperty(window, "nativeApi");
    }
  };
}

function loadedFile(contents: string, relativePath = FILE_PATH): ProjectReadFileResult {
  return {
    relativePath,
    contents,
    truncated: false,
    version: VERSION,
    encoding: "utf8",
    lineEnding: "lf",
  };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function pressFind(target: Element): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "f",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

async function loadedPreviewElement(): Promise<HTMLElement> {
  await vi.waitFor(() => {
    expect(document.querySelector<HTMLElement>("[data-workspace-file-preview]")?.tabIndex).toBe(0);
  });
  return document.querySelector<HTMLElement>("[data-workspace-file-preview]")!;
}

function fileFindInputElement(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[aria-label="Find in file"]')!;
}

function expectFileFindCollapsed(): void {
  expect(fileFindInputElement().closest('[aria-hidden="true"]')).not.toBeNull();
}

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

it("captures find only inside the active preview and resets cleanly on close", async () => {
  const restoreNativeApi = installNativeApi({
    projects: { readFile: vi.fn().mockResolvedValue(loadedFile("Error one. Error two.")) },
  } as unknown as NativeApi);

  try {
    await render(
      <QueryClientProvider client={makeQueryClient()}>
        <label>
          Composer
          <textarea aria-label="Composer" />
        </label>
        <div data-browser-panel="true" tabIndex={0} aria-label="Browser surface" />
        <WorkspaceFilePreview workspaceRoot={WORKSPACE_ROOT} filePath={FILE_PATH} />
      </QueryClientProvider>,
    );

    const previewElement = await loadedPreviewElement();
    const composerEvent = pressFind(page.getByRole("textbox", { name: "Composer" }).element());
    const browserEvent = pressFind(page.getByLabelText("Browser surface").element());
    expect(composerEvent.defaultPrevented).toBe(false);
    expect(browserEvent.defaultPrevented).toBe(false);
    expectFileFindCollapsed();

    const preview = page.getByRole("region", { name: `File preview: ${FILE_PATH}` });
    const previewEvent = pressFind(previewElement);
    expect(previewEvent.defaultPrevented).toBe(true);
    const findInput = page.getByRole("textbox", { name: "Find in file" });
    await expect.element(findInput).toBeVisible();
    await expect.element(findInput).toHaveFocus();

    await findInput.fill("error");
    await expect.element(page.getByText("1 / 2 results")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(expectFileFindCollapsed);
    await expect.element(preview).toHaveFocus();

    pressFind(previewElement);
    await expect.element(findInput).toBeVisible();
    await expect.element(findInput).toHaveValue("");
    expect(document.querySelectorAll("[data-chat-find-match]")).toHaveLength(0);
  } finally {
    restoreNativeApi();
  }
});

it("highlights source matches and navigates deterministically with Enter and Shift+Enter", async () => {
  const restoreNativeApi = installNativeApi({
    projects: {
      readFile: vi.fn().mockResolvedValue(loadedFile("Error one.\nMiddle.\nerror two.")),
    },
  } as unknown as NativeApi);

  try {
    await render(
      <QueryClientProvider client={makeQueryClient()}>
        <WorkspaceFilePreview workspaceRoot={WORKSPACE_ROOT} filePath={FILE_PATH} />
      </QueryClientProvider>,
    );
    const previewElement = await loadedPreviewElement();
    document
      .querySelector(".editor-file-viewer")
      ?.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    expect(document.activeElement).toBe(previewElement);
    await userEvent.keyboard("{Control>}f{/Control}");
    const input = page.getByRole("textbox", { name: "Find in file" });
    await input.fill("error");

    await expect.element(page.getByText("1 / 2 results")).toBeVisible();
    await expect
      .poll(() => document.querySelectorAll('[data-chat-find-match="true"]').length)
      .toBe(1);
    await expect
      .poll(() => document.querySelectorAll('[data-chat-find-match="active"]').length)
      .toBe(1);

    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByText("2 / 2 results")).toBeVisible();
    expect(document.querySelector('[data-chat-find-match="active"]')?.textContent).toBe("error");

    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await expect.element(page.getByText("1 / 2 results")).toBeVisible();
    expect(document.querySelector('[data-chat-find-match="active"]')?.textContent).toBe("Error");

    await input.fill("missing");
    await expect.element(page.getByText("No results")).toBeVisible();
    expect(document.querySelectorAll("[data-chat-find-match]")).toHaveLength(0);
  } finally {
    restoreNativeApi();
  }
});

it("recomputes and clamps the active match when loaded file contents change", async () => {
  const queryClient = makeQueryClient();
  const restoreNativeApi = installNativeApi({
    projects: { readFile: vi.fn().mockResolvedValue(loadedFile("error first\nerror second")) },
  } as unknown as NativeApi);

  try {
    await render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceFilePreview workspaceRoot={WORKSPACE_ROOT} filePath={FILE_PATH} />
      </QueryClientProvider>,
    );
    pressFind(await loadedPreviewElement());
    await page.getByRole("textbox", { name: "Find in file" }).fill("error");
    await expect.element(page.getByText("1 / 2 results")).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByText("2 / 2 results")).toBeVisible();

    const options = projectReadFileQueryOptions({
      cwd: WORKSPACE_ROOT,
      relativePath: FILE_PATH,
    });
    queryClient.setQueryData(options.queryKey, loadedFile("updated error only"));

    await expect.element(page.getByText("1 / 1 results")).toBeVisible();
    await expect
      .poll(() => document.querySelectorAll('[data-chat-find-match="active"]').length)
      .toBe(1);
    expect(document.querySelector('[data-chat-find-match="active"]')?.textContent).toBe("error");

    queryClient.setQueryData(options.queryKey, loadedFile("error first again\nerror second again"));
    await expect.element(page.getByText("1 / 2 results")).toBeVisible();
  } finally {
    restoreNativeApi();
  }
});

it("finds and distinguishes matches in rendered markdown", async () => {
  const markdownPath = "README.md";
  const restoreNativeApi = installNativeApi({
    projects: {
      readFile: vi.fn().mockResolvedValue(loadedFile("# Error\n\nAnother error.", markdownPath)),
    },
  } as unknown as NativeApi);

  try {
    await render(
      <QueryClientProvider client={makeQueryClient()}>
        <WorkspaceFilePreview
          workspaceRoot={WORKSPACE_ROOT}
          filePath={markdownPath}
          markdownPreviewDefault
        />
      </QueryClientProvider>,
    );
    pressFind(await loadedPreviewElement());
    await page.getByRole("textbox", { name: "Find in file" }).fill("error");

    await expect.element(page.getByText("1 / 2 results")).toBeVisible();
    await expect
      .poll(
        () => document.querySelectorAll(".editor-markdown-preview [data-chat-find-match]").length,
      )
      .toBe(2);
    await expect
      .poll(
        () =>
          document.querySelectorAll('.editor-markdown-preview [data-chat-find-match="active"]')
            .length,
      )
      .toBe(1);
  } finally {
    restoreNativeApi();
  }
});
