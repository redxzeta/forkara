// FILE: EditedFileActions.browser.tsx
// Purpose: Browser coverage for edited-file preview, editor, reveal, and copy actions.

import "../../index.css";

import { page, userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useMemo } from "react";

import { WorkspaceFileOpenerContext } from "~/lib/workspaceFileOpener";
import { EditedFileActions } from "./EditedFileActions";

const originalNativeApi = window.nativeApi;
const originalDesktopBridge = window.desktopBridge;

const openInEditor = vi.fn();
const showInFolder = vi.fn();
const writeText = vi.fn();

function ActionsHarness(props: {
  openFile: (path: string) => boolean;
  prefetchFile: (path: string) => void;
}) {
  const opener = useMemo(
    () => ({ openFile: props.openFile, prefetchFile: props.prefetchFile }),
    [props.openFile, props.prefetchFile],
  );
  return (
    <WorkspaceFileOpenerContext.Provider value={opener}>
      <div className="group/changed-file-row">
        <EditedFileActions filePath="src/app.ts" workspaceRoot="/repo/project" />
      </div>
    </WorkspaceFileOpenerContext.Provider>
  );
}

async function mountActions(openFile = vi.fn(() => true), prefetchFile = vi.fn()) {
  return {
    openFile,
    prefetchFile,
    mounted: await render(<ActionsHarness openFile={openFile} prefetchFile={prefetchFile} />),
  };
}

beforeEach(() => {
  openInEditor.mockReset().mockResolvedValue(undefined);
  showInFolder.mockReset().mockResolvedValue(undefined);
  writeText.mockReset().mockResolvedValue(undefined);
  window.localStorage.clear();
  window.nativeApi = {
    server: {
      getConfig: vi.fn().mockResolvedValue({ availableEditors: ["vscode"] }),
    },
    shell: { openInEditor, showInFolder },
  } as unknown as NonNullable<typeof window.nativeApi>;
  window.desktopBridge = {} as NonNullable<typeof window.desktopBridge>;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  if (originalNativeApi) {
    window.nativeApi = originalNativeApi;
  } else {
    delete window.nativeApi;
  }
  if (originalDesktopBridge) {
    window.desktopBridge = originalDesktopBridge;
  } else {
    delete window.desktopBridge;
  }
});

describe("EditedFileActions", () => {
  it("opens the actual file with a keyboard-accessible preview action", async () => {
    const { openFile, prefetchFile, mounted } = await mountActions();
    const openButton = page.getByRole("button", { name: "Open app.ts in file preview" });

    openButton.element().focus();
    await userEvent.keyboard("{Enter}");

    expect(prefetchFile).toHaveBeenCalledWith("src/app.ts");
    expect(openFile).toHaveBeenCalledWith("src/app.ts");
    await mounted.unmount();
  });

  it("exposes editor, file-manager, relative-copy, and absolute-copy menu actions", async () => {
    const { mounted } = await mountActions();
    const moreActions = page.getByRole("button", { name: "More actions for app.ts" });

    moreActions.element().focus();
    await userEvent.keyboard("{Enter}");
    await page.getByRole("menuitem", { name: "Open in configured editor" }).click();
    await vi.waitFor(() => {
      expect(openInEditor).toHaveBeenCalledWith("/repo/project/src/app.ts", "vscode");
    });

    await moreActions.click();
    await page.getByRole("menuitem", { name: "Show in folder" }).click();
    expect(showInFolder).toHaveBeenCalledWith("/repo/project/src/app.ts");

    await moreActions.click();
    await page.getByRole("menuitem", { name: "Copy relative path" }).click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("src/app.ts"));

    await moreActions.click();
    await page.getByRole("menuitem", { name: "Copy absolute path" }).click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("/repo/project/src/app.ts"));

    await mounted.unmount();
  });
});
