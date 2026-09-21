#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

interface ParsedOptions {
  base: string;
  upstream: string;
  remote: string;
}

interface UpstreamSyncState {
  base: string;
  upstreamRef: string;
  upstreamHead: string;
  syncedAt: string;
  evaluatedUpstreamHead?: string;
  evaluatedAt?: string;
}

const UPSTREAM_SYNC_STATE_PATH = ".github/upstream-sync-state.json";

function parseArgs(argv: string[]): ParsedOptions {
  const valueFor = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const options = {
    base: valueFor("base") ?? "built-from-scratch",
    upstream: valueFor("upstream") ?? "main",
    remote: valueFor("remote") ?? "upstream",
  };
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.base)) {
    throw new Error(`Invalid base branch '${options.base}'.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.upstream)) {
    throw new Error(`Invalid upstream branch '${options.upstream}'.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.remote)) {
    throw new Error(`Invalid remote name '${options.remote}'.`);
  }
  return options;
}

function runGit(args: string[], allowFailure = false): { output: string; status: number } {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  if (status !== 0 && !allowFailure) {
    throw new Error(`Command failed: git ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
  return { output: status === 0 ? result.stdout.trim() : "", status };
}

function normalizeRemoteUrl(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const sshMatch = cleaned.match(/^git@([^:]+):(.+)$/);
  return (sshMatch ? `https://${sshMatch[1]}/${sshMatch[2]}` : cleaned).toLowerCase();
}

function ensureUpstreamRemote(remote: string, upstreamUrl: string): void {
  const configured = runGit(["remote", "get-url", remote], true).output;
  if (!configured) {
    runGit(["remote", "add", remote, upstreamUrl]);
    return;
  }
  if (normalizeRemoteUrl(configured) !== normalizeRemoteUrl(upstreamUrl)) {
    throw new Error(
      `Remote '${remote}' is configured as '${configured}', expected '${upstreamUrl}'.`,
    );
  }
}

function readSyncState(expectedBase: string, expectedUpstreamRef: string): UpstreamSyncState {
  const parsed = JSON.parse(readFileSync(UPSTREAM_SYNC_STATE_PATH, "utf8")) as UpstreamSyncState;
  if (parsed.base !== expectedBase || parsed.upstreamRef !== expectedUpstreamRef) {
    throw new Error(
      `Sync state targets ${parsed.base}/${parsed.upstreamRef}, expected ${expectedBase}/${expectedUpstreamRef}.`,
    );
  }
  return parsed;
}

function appendEnvironmentFile(path: string | undefined, value: string): void {
  if (path) appendFileSync(path, `${value}\n`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const upstreamUrl = "https://github.com/Emanuele-web04/synara.git";
  const upstreamRef = `${options.remote}/${options.upstream}`;
  ensureUpstreamRemote(options.remote, upstreamUrl);
  runGit(["fetch", "--quiet", options.remote, options.upstream]);

  const state = readSyncState(options.base, upstreamRef);
  const upstreamHead = runGit(["rev-parse", upstreamRef]).output;
  const evaluatedHead = state.evaluatedUpstreamHead ?? state.upstreamHead;
  if (runGit(["cat-file", "-e", `${evaluatedHead}^{commit}`], true).status !== 0) {
    throw new Error(`Evaluated upstream head ${evaluatedHead} is unavailable after fetch.`);
  }
  if (
    evaluatedHead !== upstreamHead &&
    runGit(["merge-base", "--is-ancestor", evaluatedHead, upstreamHead], true).status !== 0
  ) {
    throw new Error(
      `Evaluated head ${evaluatedHead} is not an ancestor of current upstream ${upstreamHead}; audit manually.`,
    );
  }

  const commitLines =
    evaluatedHead === upstreamHead
      ? []
      : runGit(["log", "--reverse", "--format=%H%x09%s", `${evaluatedHead}..${upstreamHead}`])
          .output.split("\n")
          .filter(Boolean);
  const count = commitLines.length;
  appendEnvironmentFile(
    process.env.GITHUB_OUTPUT,
    `upstream_head=${upstreamHead}\nevaluated_head=${evaluatedHead}\nunevaluated_count=${count}`,
  );

  const report = [
    "## Upstream audit",
    "",
    `- Last evaluated: \`${evaluatedHead}\` (${state.evaluatedAt ?? "legacy full-sync watermark"})`,
    `- Current upstream: \`${upstreamHead}\``,
    `- Unevaluated commits: **${count}**`,
  ];
  if (count > 0) {
    report.push(
      "",
      "### Commits",
      "",
      ...commitLines.map((line) => `- \`${line.slice(0, 12)}\` ${line.slice(41)}`),
    );
  }
  appendEnvironmentFile(process.env.GITHUB_STEP_SUMMARY, report.join("\n"));
  console.log(report.join("\n"));
  console.log("Audit only: no branch, merge, commit, push, or pull request was created.");
}

main();
