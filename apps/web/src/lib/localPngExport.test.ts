import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  copyDesktop: vi.fn(),
  toBlob: vi.fn(),
}));

vi.mock("html-to-image", () => ({ toBlob: mocks.toBlob }));
vi.mock("~/lib/desktopClipboard", () => ({
  copyPngBlobToDesktopClipboard: mocks.copyDesktop,
}));

import { copyPngBlobToClipboard, renderNodeToPngBlob } from "~/lib/localPngExport";

describe("local PNG export", () => {
  beforeEach(() => {
    mocks.copyDesktop.mockReset().mockResolvedValue(false);
    mocks.toBlob.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rasterizes with explicit deterministic geometry", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const node = {} as HTMLElement;
    mocks.toBlob.mockResolvedValue(blob);

    await expect(
      renderNodeToPngBlob(node, {
        width: 1200,
        height: 675,
        pixelRatio: 1,
        backgroundColor: "#080b10",
      }),
    ).resolves.toBe(blob);
    expect(mocks.toBlob).toHaveBeenCalledWith(node, {
      width: 1200,
      height: 675,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: "#080b10",
    });
  });

  it("returns null when local rasterization fails", async () => {
    mocks.toBlob.mockRejectedValue(new Error("canvas failed"));
    await expect(
      renderNodeToPngBlob({} as HTMLElement, { width: 1200, height: 675 }),
    ).resolves.toBeNull();
  });

  it("prefers the desktop image clipboard", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    mocks.copyDesktop.mockResolvedValue(true);

    await expect(copyPngBlobToClipboard(blob)).resolves.toBe(true);
  });

  it("uses ClipboardItem when the desktop clipboard is unavailable", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const write = vi.fn().mockResolvedValue(undefined);
    const items: Array<Record<string, Blob>> = [];
    function ClipboardItemStub(item: Record<string, Blob>) {
      items.push(item);
    }
    vi.stubGlobal("ClipboardItem", ClipboardItemStub);
    vi.stubGlobal("navigator", { clipboard: { write } });

    await expect(copyPngBlobToClipboard(blob)).resolves.toBe(true);
    expect(items).toEqual([{ "image/png": blob }]);
    expect(write).toHaveBeenCalledOnce();
  });

  it("fails closed when no image clipboard exists", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    await expect(copyPngBlobToClipboard(new Blob(["png"], { type: "image/png" }))).resolves.toBe(
      false,
    );
  });
});
