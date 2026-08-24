import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { makeResetDepartmentService } from "./ResetDepartmentService";

const temporaryRoots: string[] = [];

async function makeWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "forkara-reset-department-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("ResetDepartmentService dependency cleanup", () => {
  const service = makeResetDepartmentService({ fs });

  it("previews and removes only the canonical workspace node_modules directory", async () => {
    const workspaceRoot = await makeWorkspace();
    const targetPath = path.join(workspaceRoot, "node_modules");
    await fs.mkdir(path.join(targetPath, "fixture"), { recursive: true });
    await fs.writeFile(path.join(targetPath, "fixture", "index.js"), "fixture");
    await fs.writeFile(path.join(workspaceRoot, "package.json"), '{"name":"fixture"}');
    await fs.writeFile(path.join(workspaceRoot, "bun.lock"), "lockfile");

    const preview = await Effect.runPromise(
      service.previewDependencyCleanup({ cwd: workspaceRoot }),
    );
    expect(preview).toEqual({
      workspaceRoot,
      targetPath,
      state: "ready",
      packageManager: "bun",
      installCommand: "bun install",
    });

    const result = await Effect.runPromise(
      service.executeDependencyCleanup({ cwd: workspaceRoot }),
    );
    expect(result).toEqual({ ...preview, state: "missing", removed: true });
    await expect(fs.stat(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readFile(path.join(workspaceRoot, "package.json"), "utf8")).resolves.toContain(
      "fixture",
    );
    await expect(fs.readFile(path.join(workspaceRoot, "bun.lock"), "utf8")).resolves.toBe(
      "lockfile",
    );
  });

  it("treats missing node_modules as a successful no-op", async () => {
    const workspaceRoot = await makeWorkspace();
    await fs.writeFile(path.join(workspaceRoot, "package.json"), '{"packageManager":"pnpm@10"}');

    const result = await Effect.runPromise(
      service.executeDependencyCleanup({ cwd: workspaceRoot }),
    );
    expect(result).toEqual({
      workspaceRoot,
      targetPath: path.join(workspaceRoot, "node_modules"),
      state: "missing",
      packageManager: "pnpm",
      installCommand: "pnpm install",
      removed: false,
    });
  });

  it("rejects a node_modules symlink without touching its external target", async () => {
    const workspaceRoot = await makeWorkspace();
    const externalRoot = await makeWorkspace();
    const sentinel = path.join(externalRoot, "keep.txt");
    await fs.writeFile(sentinel, "safe");
    await fs.symlink(externalRoot, path.join(workspaceRoot, "node_modules"), "dir");

    await expect(
      Effect.runPromise(service.previewDependencyCleanup({ cwd: workspaceRoot })),
    ).rejects.toMatchObject({
      _tag: "ResetDepartmentError",
      reason: "unsafe-target",
    });
    await expect(fs.readFile(sentinel, "utf8")).resolves.toBe("safe");
  });

  it.each([
    ["pnpm-lock.yaml", "pnpm", "pnpm install"],
    ["yarn.lock", "yarn", "yarn install"],
    ["package-lock.json", "npm", "npm install"],
  ] as const)(
    "detects %s without running its install command",
    async (lockfile, manager, command) => {
      const workspaceRoot = await makeWorkspace();
      await fs.writeFile(path.join(workspaceRoot, lockfile), "lockfile");

      const preview = await Effect.runPromise(
        service.previewDependencyCleanup({ cwd: workspaceRoot }),
      );
      expect(preview.packageManager).toBe(manager);
      expect(preview.installCommand).toBe(command);
      expect(preview.state).toBe("missing");
    },
  );
});
