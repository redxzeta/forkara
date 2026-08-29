import "../index.css";

import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const nativeApi = vi.hoisted(() => ({
  onProvisionProgress: vi.fn(() => () => undefined),
  pickFolder: vi.fn(async () => "/picked/project"),
}));

vi.mock("../env", () => ({ isElectron: true }));
vi.mock("../nativeApi", () => ({
  readNativeApi: () => ({
    dialogs: { pickFolder: nativeApi.pickFolder },
    projects: { onProvisionProgress: nativeApi.onProvisionProgress },
  }),
}));

import { CreateProjectDock } from "./CreateProjectDock";

describe("CreateProjectDock desktop folder input", () => {
  afterEach(() => {
    nativeApi.onProvisionProgress.mockClear();
    nativeApi.pickFolder.mockClear();
    delete window.desktopBridge;
  });

  it("never opens Browse implicitly and only invokes it from the explicit control", async () => {
    await render(
      <CreateProjectDock
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/tmp"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(nativeApi.pickFolder).not.toHaveBeenCalled();
    await page.getByRole("button", { name: "Source folder" }).click();
    await vi.waitFor(() => expect(nativeApi.pickFolder).toHaveBeenCalledOnce());
    expect((page.getByLabelText("Project folder path").element() as HTMLInputElement).value).toBe(
      "/picked/project",
    );
  });

  it("accepts an OS directory drop without invoking Browse", async () => {
    const file = new File([], "dropped-project");
    window.desktopBridge = {
      getPathForFile: () => "/dropped/project",
    } as unknown as NonNullable<typeof window.desktopBridge>;
    await render(
      <CreateProjectDock
        open
        githubProvisioningAvailable
        spaces={[]}
        activeSpaceId={null}
        defaultCloneParent="/tmp"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        types: ["Files"],
        items: [
          {
            kind: "file",
            getAsFile: () => file,
            webkitGetAsEntry: () => ({ isDirectory: true }),
          },
        ],
        files: [file],
      },
    });
    window.dispatchEvent(drop);

    await vi.waitFor(() =>
      expect((page.getByLabelText("Project folder path").element() as HTMLInputElement).value).toBe(
        "/dropped/project",
      ),
    );
    expect(nativeApi.pickFolder).not.toHaveBeenCalled();
  });
});
