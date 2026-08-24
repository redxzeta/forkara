import { downloadBlob } from "~/lib/browserDownload";
import {
  MERGE_FLEX_CARD_HEIGHT,
  MERGE_FLEX_CARD_WIDTH,
  mergeFlexCardFilename,
  type MergeFlexCardModel,
} from "~/lib/mergeFlexCard";
import { copyPngBlobToClipboard, renderNodeToPngBlob } from "~/lib/localPngExport";

export type MergeFlexCardCopyResult = "copied" | "downloaded" | "render-failed";
export type MergeFlexCardDownloadResult = "downloaded" | "render-failed";

interface MergeFlexCardExportDependencies {
  readonly render: (node: HTMLElement) => Promise<Blob | null>;
  readonly copy: (blob: Blob) => Promise<boolean>;
  readonly download: (blob: Blob, filename: string) => void;
}

export interface MergeFlexCardExporter {
  readonly copyOrDownload: (
    node: HTMLElement,
    model: MergeFlexCardModel,
  ) => Promise<MergeFlexCardCopyResult>;
  readonly download: (
    node: HTMLElement,
    model: MergeFlexCardModel,
  ) => Promise<MergeFlexCardDownloadResult>;
}

export async function renderMergeFlexCardPng(node: HTMLElement): Promise<Blob | null> {
  return renderNodeToPngBlob(node, {
    width: MERGE_FLEX_CARD_WIDTH,
    height: MERGE_FLEX_CARD_HEIGHT,
    pixelRatio: 1,
    backgroundColor: "#080b10",
  });
}

/**
 * Copy falls back to a local download when neither desktop nor ClipboardItem image copy exists.
 * Dependencies are injectable so fallback behavior stays deterministic in unit tests.
 */
export function makeMergeFlexCardExporter(
  dependencies: MergeFlexCardExportDependencies = {
    render: renderMergeFlexCardPng,
    copy: copyPngBlobToClipboard,
    download: downloadBlob,
  },
): MergeFlexCardExporter {
  return {
    copyOrDownload: async (node, model) => {
      const blob = await dependencies.render(node);
      if (!blob) return "render-failed";
      if (await dependencies.copy(blob)) return "copied";
      dependencies.download(blob, mergeFlexCardFilename(model));
      return "downloaded";
    },
    download: async (node, model) => {
      const blob = await dependencies.render(node);
      if (!blob) return "render-failed";
      dependencies.download(blob, mergeFlexCardFilename(model));
      return "downloaded";
    },
  };
}

export const mergeFlexCardExporter = makeMergeFlexCardExporter();
