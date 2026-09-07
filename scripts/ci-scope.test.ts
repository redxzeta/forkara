import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedPaths, requiresFullValidation } from "./ci-scope.ts";

describe("CI scope", () => {
  it("rejects failures, cancellations and unexpected skips in the required gate", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    const gate = workflow
      .split("      - name: Require selected validation")[1]!
      .split("        run: |\n")[1]!
      .split("\n  windows_process:")[0]!;
    for (const full of ["true", "false", ""]) {
      for (const result of ["success", "failure", "cancelled", "skipped"]) {
        const run = (staticResult: string, testResult: string, browserResult: string) =>
          spawnSync("bash", ["-e", "-c", gate], {
            env: {
              ...process.env,
              STATIC_RESULT: staticResult,
              TEST_RESULT: testResult,
              BROWSER_RESULT: browserResult,
              FULL: full,
            },
          }).status === 0;
        expect(run("success", "success", result)).toBe(
          (full === "true" && result === "success") || (full === "false" && result === "skipped"),
        );
        if (result !== "success") {
          expect(run(result, "success", "success")).toBe(false);
          expect(run("success", result, "success")).toBe(false);
        }
      }
    }
  });

  it("selects full validation when the event/diff is unavailable", () => {
    const root = mkdtempSync(join(tmpdir(), "forkara-ci-fallback-"));
    try {
      const output = join(root, "output");
      execFileSync(process.execPath, [new URL("./ci-scope.ts", import.meta.url).pathname], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_EVENT_PATH: join(root, "missing.json"),
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: join(root, "summary"),
        },
        stdio: "pipe",
      });
      expect(readFileSync(output, "utf8")).toBe("full=true\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows only reviewed docs and architecture tooling", () => {
    expect(
      requiresFullValidation("pull_request", [
        "README.md",
        "docs/architecture.md",
        "scripts/check-architecture-boundaries.ts",
        "scripts/check-architecture-boundaries.test.ts",
      ]),
    ).toBe(false);
  });

  it.each([
    "apps/web/src/main.tsx",
    "apps/server/src/main.ts",
    "apps/desktop/src/main.ts",
    "packages/shared/src/git.ts",
    "packages/contracts/src/model.ts",
    "bun.lock",
    "package.json",
    "turbo.json",
    "patches/dependency.patch",
    ".github/workflows/ci.yml",
    "scripts/ci-scope.ts",
    "scripts/build-desktop-artifact.ts",
    "docs/example.ts",
    "apps/web/README.md",
    "new-directory/file.txt",
    "docs/README.md\napps/web/main.ts",
  ])("runs full validation for %s even alongside docs", (path) => {
    expect(requiresFullValidation("pull_request", ["README.md", path])).toBe(true);
  });

  it("fails closed for empty diffs and every non-PR event", () => {
    expect(requiresFullValidation("pull_request", [])).toBe(true);
    for (const event of ["push", "schedule", "workflow_dispatch", "unknown"]) {
      expect(requiresFullValidation(event, ["README.md"])).toBe(true);
    }
  });

  it("includes deleted runtime paths when files move into docs, without truncation", () => {
    const root = mkdtempSync(join(tmpdir(), "forkara-ci-scope-"));
    const original = process.cwd();
    try {
      process.chdir(root);
      const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
      git("init", "--quiet");
      git("config", "user.email", "ci@example.invalid");
      git("config", "user.name", "CI Test");
      mkdirSync("apps/web", { recursive: true });
      mkdirSync("docs");
      writeFileSync("apps/web/runtime.ts", "runtime");
      git("add", ".");
      git("commit", "--quiet", "-m", "base");
      const base = git("rev-parse", "HEAD");
      git("mv", "apps/web/runtime.ts", "docs/runtime.md");
      for (let i = 0; i < 350; i++) writeFileSync(`docs/${i}.md`, "docs");
      git("add", ".");
      git("commit", "--quiet", "-m", "move");
      const paths = changedPaths(base, git("rev-parse", "HEAD"));
      expect(paths).toHaveLength(352);
      expect(paths).toContain("apps/web/runtime.ts");
      expect(requiresFullValidation("pull_request", paths)).toBe(true);
      expect(() => changedPaths("--bad-ref", base)).toThrow("commit SHAs");
    } finally {
      process.chdir(original);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
