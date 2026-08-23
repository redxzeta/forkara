// FILE: check-readme-truthiness.ts
// Purpose: Parody-safe checker for README claims that conflict with local git facts.

import { execFileSync, type ExecSyncOptions } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectReadmeTruthiness,
  type ReadmeTruthinessEvidence,
  type ReadmeTruthinessFinding,
  type ReadmeTruthinessRemote,
} from "@forkara/shared/readmeTruthiness";

export { detectReadmeTruthiness } from "@forkara/shared/readmeTruthiness";
export type { ReadmeTruthinessEvidence } from "@forkara/shared/readmeTruthiness";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README_PATH = resolve(REPO_ROOT, "README.md");

function runGit(args: readonly string[], cwd: string): string | null {
  const options: ExecSyncOptions = {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  };
  try {
    const output = execFileSync("git", [...args], options);
    return typeof output === "string" ? output.trim() : output.toString("utf8").trim();
  } catch {
    return null;
  }
}

export function parseUpstreamRemoteSignals(
  lines: readonly string[],
): readonly ReadmeTruthinessRemote[] {
  const remoteLine = /^([^\s]+)\s+([^\s]+)\s+\((fetch|push)\)$/u;
  const remotesByName = new Map<string, string>();

  for (const raw of lines) {
    const match = remoteLine.exec(raw.trim());
    if (!match || match[1] === undefined || match[2] === undefined) continue;
    const [name, url] = [match[1], match[2]!] as const;
    if (!remotesByName.has(name)) {
      remotesByName.set(name, url);
    }
  }

  return [...remotesByName.entries()].map(([name, fetchUrl]) => ({ name, fetchUrl }));
}

export function collectGitEvidence(cwd = process.cwd()): ReadmeTruthinessEvidence {
  const upstreamRef = runGit(["rev-parse", "--abbrev-ref", "@{upstream}"], cwd);
  const remoteLines = runGit(["remote", "-v"], cwd);
  const remotes =
    remoteLines === null || remoteLines.length === 0
      ? []
      : parseUpstreamRemoteSignals(remoteLines.split("\n"));
  const hasUpstreamRemote = remotes.some((remote) => remote.name === "upstream");

  return {
    upstreamRef,
    remotes,
    hasUpstreamRemote,
  };
}

function renderConsoleFinding(finding: ReadmeTruthinessFinding): void {
  console.error(`- ${finding.title}: ${finding.message}`);
  for (const claim of finding.readmeClaims) {
    console.error(`  - README ${String(claim.line)}: ${claim.text}`);
  }
  for (const source of finding.evidence) {
    console.error(`  - evidence: ${source}`);
  }
}

function main(): void {
  let readmeContents: string;
  try {
    readmeContents = readFileSync(README_PATH, "utf8");
  } catch {
    console.error("README truthiness checker could not read README.md from repository root.");
    process.exitCode = 1;
    return;
  }

  const findings = detectReadmeTruthiness(readmeContents, collectGitEvidence(REPO_ROOT));
  if (findings.length === 0) {
    console.log("README truthiness check passed with nothing suspicious.");
    return;
  }

  console.error("README Truthiness Checker: local facts disagree with README bravado.");
  for (const finding of findings) {
    renderConsoleFinding(finding);
  }
  process.exitCode = 1;
}

if (import.meta.main) main();
