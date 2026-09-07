import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Only reviewed, non-runtime paths may skip browser tests and the explicit
// desktop build. New/unknown paths deliberately select full validation.
export function requiresFullValidation(eventName: string, paths: readonly string[]): boolean {
  if (eventName !== "pull_request" || paths.length === 0) return true;
  return paths.some(
    (path) =>
      !/^(?:docs\/|\.docs\/|\.plans\/|plans\/|advisor-plans\/|audit\/).*\.md$/.test(path) &&
      !/^[^/]+\.md$/.test(path) &&
      !/^scripts\/check-architecture-boundaries(?:\.test)?\.ts$/.test(path),
  );
}

export function changedPaths(base: string, head: string): string[] {
  // SHAs come from the event payload, never shell interpolation. No API file
  // limit; --no-renames includes both sides of moves out of runtime paths.
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error("Expected full base and head commit SHAs");
  }
  return execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let full = true;
  try {
    if (process.env.GITHUB_EVENT_NAME === "pull_request") {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8"));
      full = requiresFullValidation(
        "pull_request",
        changedPaths(event.pull_request.base.sha, event.pull_request.head.sha),
      );
    }
  } catch {
    console.warn("::warning::Cannot establish changed paths; running full validation.");
  }
  const summary = full
    ? "Full validation: runtime, unknown paths, non-PR event, or unavailable diff."
    : "Docs/architecture-only: all static and unit checks run; browser and explicit desktop build skipped.";
  console.log(summary);
  appendFileSync(process.env.GITHUB_OUTPUT!, `full=${full}\n`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY!, `${summary}\n`);
}
