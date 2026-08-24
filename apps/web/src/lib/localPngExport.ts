// FILE: localPngExport.ts
// Purpose: Rasterize fixed-size local UI into PNG and copy PNG blobs without a cloud service.
// Layer: Shared web utility.

import { toBlob } from "html-to-image";

import { copyPngBlobToDesktopClipboard } from "~/lib/desktopClipboard";

export interface LocalPngRenderOptions {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio?: number;
  readonly backgroundColor?: string;
}

/** Renders a DOM node entirely on-device with explicit output geometry. */
export async function renderNodeToPngBlob(
  node: HTMLElement,
  options: LocalPngRenderOptions,
): Promise<Blob | null> {
  try {
    return await toBlob(node, {
      width: options.width,
      height: options.height,
      pixelRatio: options.pixelRatio ?? 1,
      cacheBust: true,
      backgroundColor: options.backgroundColor ?? "transparent",
    });
  } catch {
    return null;
  }
}

/** Uses the native desktop clipboard first, then the browser ClipboardItem API. */
export async function copyPngBlobToClipboard(blob: Blob): Promise<boolean> {
  if (await copyPngBlobToDesktopClipboard(blob)) {
    return true;
  }

  try {
    if (
      typeof ClipboardItem === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.clipboard?.write
    ) {
      return false;
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
