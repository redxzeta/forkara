import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export interface ArchitectureBoundaryViolation {
  readonly importer: string;
  readonly imported: string;
  readonly remedy: string;
  readonly rule: string;
}

const SOURCE_FILE = /\.(?:[cm]?ts|tsx)$/u;
const STATIC_IMPORT_SPECIFIER =
  /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']/gu;
const DYNAMIC_IMPORT_SPECIFIER = /\bimport\s*\(\s*["']([^"']+)["']/gu;

// These are named, test-only bridges rather than path globs. E2E fixtures have
// to compose the real browser, desktop, and server harnesses; no production web
// module may use those imports. The Claude SDK bridge is a #174 compatibility
// seam until external-history loading is exposed through ProviderAdapter.
const TEMPORARY_COMPATIBILITY_BRIDGES = new Map<string, ReadonlySet<string>>([
  [
    "apps/web/e2e/fixtures/mcpBrowserHarness.ts",
    new Set([
      "../../../server/src/agentGateway/browserTools",
      "../../../server/src/agentGateway/inFlightRequestRegistry",
      "../../../server/src/agentGateway/mcpTransport",
      "../../../server/src/agentGateway/Layers/AgentGatewaySessionRegistry",
      "../../../server/src/browserAutomation/Layers/BrowserAutomationHost",
      "../../../server/src/agentGateway/Services/AgentGatewayCredentials",
    ]),
  ],
  [
    "apps/web/e2e/fixtures/visibleBrowserMain.ts",
    new Set([
      "../../../desktop/src/browserManager",
      "../../../desktop/src/browserUsePipeServer",
      "../../../desktop/src/ipcChannels",
      "../../../desktop/src/browserAnnotations/webviewSecurity",
    ]),
  ],
  [
    "apps/server/src/orchestration/importThreadRoute.ts",
    new Set(["../provider/claudeAgentSdk.ts"]),
  ],
]);

const PROVIDER_NEUTRAL_SERVICE_MODULES = new Set([
  "ProviderAdapter",
  "ProviderAdapterRegistry",
  "ProviderService",
  "ProviderSessionDirectory",
]);

const PROVIDER_FAMILY_BY_MODULE = new Map<string, string>([
  ["AntigravityAdapter", "antigravity"],
  ["ClaudeAdapter", "claude"],
  ["CodexAdapter", "codex"],
  ["CursorAdapter", "acp"],
  ["DroidAdapter", "acp"],
  ["GrokAdapter", "acp"],
  ["KiloAdapter", "opencode"],
  ["OpenCodeAdapter", "opencode"],
  ["PiAdapter", "pi"],
]);

function toPosix(value: string) {
  return value.split(sep).join("/");
}

function repositoryPath(repoRoot: string, path: string) {
  return toPosix(relative(repoRoot, path));
}

function isWithin(path: string, directory: string) {
  const rel = relative(directory, path);
  return rel.length === 0 || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function sourceFiles(directory: string): ReadonlyArray<string> {
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (["dist", "dist-electron", "node_modules", ".turbo"].includes(entry.name)) continue;
      const candidate = resolve(current, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && SOURCE_FILE.test(entry.name)) files.push(candidate);
    }
  };
  if (existsSync(directory)) visit(directory);
  return files;
}

function importSpecifiers(source: string) {
  return [STATIC_IMPORT_SPECIFIER, DYNAMIC_IMPORT_SPECIFIER].flatMap((pattern) =>
    [...source.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : [])),
  );
}

function resolvedLocalPath(importer: string, specifier: string) {
  return specifier.startsWith(".") ? resolve(dirname(importer), specifier) : null;
}

function isTemporaryCompatibilityBridge(importer: string, imported: string) {
  return TEMPORARY_COMPATIBILITY_BRIDGES.get(importer)?.has(imported) ?? false;
}

function providerFamily(path: string) {
  if (path.includes("/provider/acp/")) return "acp";
  for (const [module, family] of PROVIDER_FAMILY_BY_MODULE) {
    if (path.endsWith(`/${module}`) || path.endsWith(`/${module}.ts`)) return family;
  }
  return null;
}

function checkImport(input: {
  readonly importer: string;
  readonly imported: string;
  readonly repoRoot: string;
}): ReadonlyArray<ArchitectureBoundaryViolation> {
  const importer = repositoryPath(input.repoRoot, input.importer);
  const localTarget = resolvedLocalPath(input.importer, input.imported);
  const contractsRoot = resolve(input.repoRoot, "packages/contracts");
  const webRoot = resolve(input.repoRoot, "apps/web");
  const desktopRoot = resolve(input.repoRoot, "apps/desktop");
  const orchestrationRoot = resolve(input.repoRoot, "apps/server/src/orchestration");
  const providerRoot = resolve(input.repoRoot, "apps/server/src/provider");
  const violations: ArchitectureBoundaryViolation[] = [];
  const violation = (rule: string, remedy: string) => {
    violations.push({ importer, imported: input.imported, rule, remedy });
  };

  if (isWithin(input.importer, contractsRoot)) {
    const isContractsTest = importer.endsWith(".test.ts");
    if (
      (!isContractsTest && input.imported.startsWith("node:")) ||
      input.imported === "electron" ||
      input.imported === "react" ||
      (input.imported.startsWith("@forkara/") && input.imported !== "@forkara/contracts") ||
      (localTarget !== null && !isWithin(localTarget, contractsRoot))
    ) {
      violation(
        "contracts-schema-only",
        "Keep packages/contracts to schemas and protocol data; move runtime behavior behind a contracts type or an owning application package.",
      );
    }
  }

  if (!isTemporaryCompatibilityBridge(importer, input.imported)) {
    const targetsServer =
      (localTarget !== null && isWithin(localTarget, resolve(input.repoRoot, "apps/server"))) ||
      input.imported === "@forkara/server" ||
      input.imported.startsWith("@forkara/server/");
    const targetsDesktop =
      localTarget !== null && isWithin(localTarget, resolve(input.repoRoot, "apps/desktop"));
    if (isWithin(input.importer, webRoot) && targetsServer) {
      violation(
        "web-must-not-import-server",
        "Use @forkara/contracts, @forkara/shared, or a typed server interface instead of server implementation.",
      );
    }
    if (isWithin(input.importer, webRoot) && targetsDesktop) {
      violation(
        "web-must-not-import-desktop-backend",
        "Keep Electron/native host code behind a typed browser or desktop bridge.",
      );
    }
  }

  const desktopTargetsServer =
    (localTarget !== null && isWithin(localTarget, resolve(input.repoRoot, "apps/server"))) ||
    input.imported === "@forkara/server" ||
    input.imported.startsWith("@forkara/server/");
  if (isWithin(input.importer, desktopRoot) && desktopTargetsServer) {
    violation(
      "desktop-must-not-import-server-implementation",
      "Use the server process/RPC boundary; desktop owns native lifecycle, not server implementation.",
    );
  }

  if (
    isWithin(input.importer, orchestrationRoot) &&
    localTarget !== null &&
    isWithin(localTarget, providerRoot)
  ) {
    const providerTarget = repositoryPath(input.repoRoot, localTarget);
    const serviceMatch = providerTarget.match(/\/provider\/Services\/([^/]+?)(?:\.ts)?$/u);
    const serviceModule = serviceMatch?.[1];
    const isNeutralService =
      serviceModule !== undefined && PROVIDER_NEUTRAL_SERVICE_MODULES.has(serviceModule);
    const isGenericProviderHelper =
      providerTarget.endsWith("/Errors") ||
      providerTarget.endsWith("/Errors.ts") ||
      /\/provider\/(?:bullyMode|debugMode|goalMode|makeNoMistake|providerAttachmentPaths|responseInstructions|skillPromptInjection|terminalTurnApplicability|threadMentionContext|unmappedProviderEvents)(?:\.ts)?$/u.test(
        providerTarget,
      );
    if (
      !isNeutralService &&
      !isGenericProviderHelper &&
      !isTemporaryCompatibilityBridge(importer, input.imported)
    ) {
      violation(
        "orchestration-must-not-import-concrete-provider",
        "Depend on ProviderService, ProviderAdapterRegistry, ProviderAdapter, or a provider-neutral contract; keep concrete provider code inside apps/server/src/provider.",
      );
    }
  }

  if (
    isWithin(input.importer, providerRoot) &&
    localTarget !== null &&
    isWithin(localTarget, providerRoot)
  ) {
    const targetPath = repositoryPath(input.repoRoot, localTarget);
    const importerFamily = providerFamily(repositoryPath(input.repoRoot, input.importer));
    const targetFamily = providerFamily(targetPath);
    if (
      importerFamily &&
      targetFamily &&
      importerFamily !== targetFamily &&
      !targetPath.includes("/provider/acp/")
    ) {
      violation(
        "provider-implementations-must-not-cross-import",
        "Use ProviderAdapter/ProviderService or a declared protocol-family module (for example provider/acp), not another concrete provider implementation.",
      );
    }
  }

  const isInterfaceAdapter =
    importer === "apps/server/src/wsRpc.ts" ||
    importer === "apps/server/src/agentGateway/httpRoute.ts" ||
    importer === "apps/server/src/externalMcp/httpRoute.ts";
  if (
    isInterfaceAdapter &&
    localTarget !== null &&
    /\/persistence\/(?:Layers|Migrations)\//u.test(repositoryPath(input.repoRoot, localTarget))
  ) {
    violation(
      "interface-adapters-must-not-reach-raw-persistence",
      "Call the owning application service; interface adapters must not access SQLite layers, migrations, or projection implementation directly.",
    );
  }

  return violations;
}

export function checkArchitectureBoundaries(
  repoRoot: string,
): ReadonlyArray<ArchitectureBoundaryViolation> {
  return ["apps/web", "apps/desktop", "apps/server/src", "packages/contracts"].flatMap(
    (directory) =>
      sourceFiles(resolve(repoRoot, directory)).flatMap((importer) =>
        importSpecifiers(readFileSync(importer, "utf8")).flatMap((imported) =>
          checkImport({ importer, imported, repoRoot }),
        ),
      ),
  );
}

export function formatArchitectureBoundaryViolations(
  violations: ReadonlyArray<ArchitectureBoundaryViolation>,
) {
  return violations
    .map(
      ({ importer, imported, remedy, rule }) =>
        `${importer} imports ${imported}\n  rule: ${rule}\n  remediation: ${remedy}`,
    )
    .join("\n\n");
}

if (import.meta.main) {
  const repoRoot = resolve(import.meta.dirname, "..");
  const violations = checkArchitectureBoundaries(repoRoot);
  if (violations.length > 0) {
    console.error(
      `Architecture boundary check failed (${violations.length} violation(s)):\n\n${formatArchitectureBoundaryViolations(violations)}`,
    );
    process.exitCode = 1;
  } else {
    console.info("Architecture boundary check passed.");
  }
}
