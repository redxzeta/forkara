import { describe, expect, it, vi } from "vitest";

import { projectParodyMergeFlexCard } from "~/lib/mergeFlexCard";
import { makeMergeFlexCardExporter } from "~/lib/mergeFlexCardExport";

const MODEL = projectParodyMergeFlexCard({ count: 42, date: "2026-08-24" });
const NODE = {} as HTMLElement;

describe("Merge Flex card export", () => {
  it("copies the rendered PNG without downloading when image clipboard support succeeds", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const copy = vi.fn().mockResolvedValue(true);
    const download = vi.fn();
    const exporter = makeMergeFlexCardExporter({
      render: vi.fn().mockResolvedValue(blob),
      copy,
      download,
    });

    await expect(exporter.copyOrDownload(NODE, MODEL)).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith(blob);
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads the same PNG when ClipboardItem image copy is unavailable", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const download = vi.fn();
    const exporter = makeMergeFlexCardExporter({
      render: vi.fn().mockResolvedValue(blob),
      copy: vi.fn().mockResolvedValue(false),
      download,
    });

    await expect(exporter.copyOrDownload(NODE, MODEL)).resolves.toBe("downloaded");
    expect(download).toHaveBeenCalledWith(blob, "forkara-merge-flex-parody-2026-08-24.png");
  });

  it("reports rasterization failure without copying or creating a download", async () => {
    const copy = vi.fn();
    const download = vi.fn();
    const exporter = makeMergeFlexCardExporter({
      render: vi.fn().mockResolvedValue(null),
      copy,
      download,
    });

    await expect(exporter.copyOrDownload(NODE, MODEL)).resolves.toBe("render-failed");
    await expect(exporter.download(NODE, MODEL)).resolves.toBe("render-failed");
    expect(copy).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("supports an explicit local PNG download", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const download = vi.fn();
    const exporter = makeMergeFlexCardExporter({
      render: vi.fn().mockResolvedValue(blob),
      copy: vi.fn(),
      download,
    });

    await expect(exporter.download(NODE, MODEL)).resolves.toBe("downloaded");
    expect(download).toHaveBeenCalledWith(blob, "forkara-merge-flex-parody-2026-08-24.png");
  });
});
