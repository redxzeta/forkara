import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkArchitectureBoundaries,
  formatArchitectureBoundaryViolations,
} from "./check-architecture-boundaries.ts";

const temporaryRoots: string[] = [];

function fixture(files: Readonly<Record<string, string>>) {
  const root = mkdtempSync(join(tmpdir(), "forkara-architecture-boundaries-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("architecture dependency boundaries", () => {
  it("allows contracts and web to use their intended shared interfaces", () => {
    const root = fixture({
      "apps/web/src/client.ts": 'import { ThreadId } from "@forkara/contracts";',
      "packages/contracts/src/schema.ts": 'import { Schema } from "effect";',
    });

    expect(checkArchitectureBoundaries(root)).toEqual([]);
  });

  it("reports actionable failures for every prohibited dependency direction", () => {
    const root = fixture({
      "apps/web/src/client.ts": 'import "../../server/src/wsRpc";',
      "apps/desktop/src/main.ts": 'import "../../server/src/main";',
      "packages/contracts/src/schema.ts":
        'import "../../../apps/server/src/persistence/Layers/Sqlite";',
      "apps/server/src/orchestration/runner.ts": 'import "../provider/Layers/CodexAdapter";',
      "apps/server/src/provider/Layers/CodexAdapter.ts": 'import "./ClaudeAdapter";',
      "apps/server/src/agentGateway/httpRoute.ts": 'import "../persistence/Layers/Sqlite";',
    });

    const violations = checkArchitectureBoundaries(root);
    expect(violations.map((violation) => violation.rule)).toEqual([
      "web-must-not-import-server",
      "desktop-must-not-import-server-implementation",
      "interface-adapters-must-not-reach-raw-persistence",
      "orchestration-must-not-import-concrete-provider",
      "provider-implementations-must-not-cross-import",
      "contracts-schema-only",
    ]);
    expect(formatArchitectureBoundaryViolations(violations)).toContain(
      "remediation: Use @forkara/contracts, @forkara/shared, or a typed server interface",
    );
  });
});
