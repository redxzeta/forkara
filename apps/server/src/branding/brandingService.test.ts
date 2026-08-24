import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  OrchestrationThread,
  ProjectFileSystemEntry,
  ProjectId,
  ThreadId,
} from "@forkara/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { ManagedAttachmentRepositoryShape } from "../persistence/Services/ManagedAttachments";
import {
  brandingGenerationResultFromThread,
  inspectBrandingEntries,
  resolveBrandingGenerationCapability,
  stageGeneratedBrandingAsset,
} from "./brandingService";

describe("brandingService", () => {
  it("requires both image artifact support and a usable provider", () => {
    const capabilities = {
      provider: "codex" as const,
      supportsSkillMentions: true,
      supportsSkillDiscovery: true,
      supportsNativeSlashCommandDiscovery: true,
      supportsPluginMentions: false,
      supportsPluginDiscovery: false,
      supportsRuntimeModelList: true,
      supportsImageGeneration: true,
    };
    expect(resolveBrandingGenerationCapability({ capabilities, status: null })).toMatchObject({
      supported: false,
    });
    expect(
      resolveBrandingGenerationCapability({
        capabilities,
        status: {
          provider: "codex",
          available: true,
          status: "ready",
          authStatus: "authenticated",
          checkedAt: "2026-08-24T00:00:00.000Z",
        },
      }),
    ).toEqual({ provider: "codex", supported: true, reason: null });
    expect(
      resolveBrandingGenerationCapability({
        capabilities: { ...capabilities, supportsImageGeneration: false },
        status: {
          provider: "codex",
          available: true,
          status: "ready",
          authStatus: "authenticated",
          checkedAt: "2026-08-24T00:00:00.000Z",
        },
      }),
    ).toMatchObject({ supported: false });
  });

  it("classifies branding locations while protecting attribution files", () => {
    const entries = [
      { path: "public/logo.svg", name: "logo.svg", kind: "file" },
      { path: "public/favicon.ico", name: "favicon.ico", kind: "file" },
      { path: "src/Header.tsx", name: "Header.tsx", kind: "file" },
      { path: "LICENSE", name: "LICENSE", kind: "file" },
    ] as ProjectFileSystemEntry[];
    const result = inspectBrandingEntries({
      projectId: "project-1" as ProjectId,
      canonicalCwd: "/repo",
      projectName: "repo",
      entries,
    });
    expect(result.locations.map((location) => [location.path, location.kind])).toEqual([
      ["public/favicon.ico", "favicon"],
      ["public/logo.svg", "logo"],
      ["src/Header.tsx", "navigation"],
    ]);
    expect(result.exclusions).toEqual(["LICENSE"]);
    expect(result.attributionGuardrails.join(" ")).toContain("NOTICE");
  });

  it("exposes only durable image_generation artifacts and reports empty completion", () => {
    const thread = {
      activities: [
        {
          kind: "tool.completed",
          payload: {
            itemType: "image_generation",
            data: { kind: "codex.generated_image", path: "/tmp/generated/logo.png" },
          },
        },
      ],
      latestTurn: { state: "completed" },
    } as unknown as OrchestrationThread;
    expect(brandingGenerationResultFromThread(thread)).toEqual({
      status: "ready",
      artifacts: [
        {
          path: "/tmp/generated/logo.png",
          name: "logo.png",
          mimeType: "image/png",
          format: "png",
        },
      ],
    });
    expect(
      brandingGenerationResultFromThread({
        activities: [],
        latestTurn: { state: "completed" },
      } as unknown as OrchestrationThread),
    ).toMatchObject({ status: "failed" });
  });

  it("copies a generated artifact byte-for-byte into managed attachment storage", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "forkara-branding-service-"));
    const sourcePath = path.join(root, "generated.png");
    const attachmentsDir = path.join(root, "attachments");
    const sourceBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    fs.writeFileSync(sourcePath, sourceBytes);
    const attachmentId = "att_v2_1234567890abcdef";
    const relativePath = `objects/12/${attachmentId}.png`;
    const repository = {
      reserve: () =>
        Effect.succeed({
          status: "reserved" as const,
          attachment: {
            attachmentId,
            ownerThreadId: "thread-apply",
            ownerKind: "session",
            ownerId: "owner-1",
            kind: "image",
            originalName: "generated.png",
            mimeType: "image/png",
            reservedBytes: sourceBytes.byteLength,
            sizeBytes: null,
            sha256: null,
            relativePath,
            state: "uploading" as const,
            stagingExpiresAt: null,
            claimCommandId: null,
            claimMessageId: null,
            claimedAt: null,
            deleteReason: null,
            deleteRequestedAt: null,
            deletedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      finalizeStaged: (input: { sizeBytes: number }) =>
        Effect.succeed({
          status: "staged" as const,
          attachment: {
            attachmentId,
            ownerThreadId: "thread-apply",
            ownerKind: "session",
            ownerId: "owner-1",
            kind: "image",
            originalName: "generated.png",
            mimeType: "image/png",
            reservedBytes: sourceBytes.byteLength,
            sizeBytes: input.sizeBytes,
            sha256: "sha",
            relativePath,
            state: "staged" as const,
            stagingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            claimCommandId: null,
            claimMessageId: null,
            claimedAt: null,
            deleteReason: null,
            deleteRequestedAt: null,
            deletedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      cancelStaged: () => Effect.succeed({ status: "cancelled" as const }),
    } as unknown as ManagedAttachmentRepositoryShape;

    try {
      const result = await Effect.runPromise(
        stageGeneratedBrandingAsset({
          source: {
            path: sourcePath,
            name: "generated.png",
            mimeType: "image/png",
            format: "png",
          },
          resolvedPath: sourcePath,
          applicationThreadId: "thread-apply" as ThreadId,
          attachmentsDir,
          principal: { ownerKind: "session", ownerId: "owner-1" },
          repository,
        }),
      );
      expect(result).toMatchObject({ type: "image", id: attachmentId, name: "generated.png" });
      expect(fs.readFileSync(path.join(attachmentsDir, relativePath))).toEqual(sourceBytes);
      expect(fs.readFileSync(sourcePath)).toEqual(sourceBytes);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
