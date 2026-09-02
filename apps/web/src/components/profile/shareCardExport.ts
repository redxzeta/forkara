// FILE: shareCardExport.ts
// Purpose: Fully offline rendering of the share card to a PNG, plus clipboard copy,
// file download, and social-intent URLs. No data leaves the device to BUILD the image;
// opening a social composer is an explicit, user-initiated action.
// Layer: web profile feature.

import {
  copyPngBlobToClipboard,
  renderNodeToPngBlob as renderLocalNodeToPngBlob,
} from "~/lib/localPngExport";
import { readNativeApi } from "~/nativeApi";

export { downloadBlob } from "~/lib/browserDownload";

const SHARE_BRAND_HANDLE = "@tryForkara";
export const SHARE_TWEET_TEXT = `Just checking my ${SHARE_BRAND_HANDLE} dev stats. Absolute masterpiece of an IDE.`;
const SHARE_URL = "https://tryforkara.com";

export type ShareTarget = "x" | "linkedin" | "reddit";

// Renders the given node to a PNG blob entirely on-device (canvas serialization).
// Passing explicit width/height keeps the export deterministic and free of trailing
// whitespace regardless of layout measurement quirks.
export async function renderNodeToPngBlob(
  node: HTMLElement,
  size?: { width: number; height: number },
): Promise<Blob | null> {
  const width = size?.width ?? node.offsetWidth;
  const height = size?.height ?? node.offsetHeight;
  if (width <= 0 || height <= 0) return null;
  return renderLocalNodeToPngBlob(node, {
    width,
    height,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
}

export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  return copyPngBlobToClipboard(blob);
}

// Opens an external URL via the desktop shell when available, else a new browser tab.
export function openExternalUrl(url: string): void {
  const api = readNativeApi();
  if (api?.shell?.openExternal) {
    void api.shell.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function shareIntentUrl(target: ShareTarget): string {
  switch (target) {
    case "x":
      return `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TWEET_TEXT)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${encodeURIComponent(
        SHARE_URL,
      )}&title=${encodeURIComponent("My Forkara dev stats")}`;
  }
}
