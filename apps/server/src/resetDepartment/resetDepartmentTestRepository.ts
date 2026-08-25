import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { Effect } from "effect";

import { GitCommandError } from "../git/Errors";
import type { GitCoreShape } from "../git/Services/GitCore";

const execFile = promisify(execFileCallback);
const temporaryRoots: string[] = [];

export async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFile("git", [...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Forkara Test",
      GIT_AUTHOR_EMAIL: "test@forkara.invalid",
      GIT_COMMITTER_NAME: "Forkara Test",
      GIT_COMMITTER_EMAIL: "test@forkara.invalid",
    },
  });
  return result.stdout.trim();
}

export async function makeTemporaryDirectory(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

export async function makeRepository(prefix = "forkara-reset-department-"): Promise<string> {
  const root = await makeTemporaryDirectory(prefix);
  await git(root, ["init", "-b", "main"]);
  await fs.writeFile(path.join(root, "tracked.txt"), "base\n");
  await git(root, ["add", "tracked.txt"]);
  await git(root, ["commit", "-m", "initial"]);
  return root;
}

export async function removeTemporaryRoots(): Promise<void> {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
}

export function makeTestGitCore(options?: {
  readonly commands?: string[][];
  readonly mutationCwds?: string[];
  readonly failCommand?: (args: readonly string[]) => boolean;
}): Pick<GitCoreShape, "execute" | "withMutation"> {
  const execute: GitCoreShape["execute"] = (request) => {
    options?.commands?.push([...request.args]);
    if (options?.failCommand?.(request.args)) {
      return Effect.fail(
        new GitCommandError({
          operation: request.operation,
          command: `git ${request.args.join(" ")}`,
          cwd: request.cwd,
          detail: "injected test failure",
        }),
      );
    }
    return Effect.tryPromise({
      try: async () => {
        try {
          const result = await execFile("git", [...request.args], {
            cwd: request.cwd,
            encoding: "utf8",
          });
          return { code: 0, stdout: result.stdout, stderr: result.stderr };
        } catch (cause) {
          const error = cause as Error & {
            readonly code?: number;
            readonly stdout?: string;
            readonly stderr?: string;
          };
          if (request.allowNonZeroExit && typeof error.code === "number") {
            return {
              code: error.code,
              stdout: error.stdout ?? "",
              stderr: error.stderr ?? error.message,
            };
          }
          throw cause;
        }
      },
      catch: (cause) =>
        new GitCommandError({
          operation: request.operation,
          command: `git ${request.args.join(" ")}`,
          cwd: request.cwd,
          detail: cause instanceof Error ? cause.message : "test Git command failed",
          cause,
        }),
    });
  };
  const withMutation: GitCoreShape["withMutation"] = (cwd, effect) => {
    options?.mutationCwds?.push(cwd);
    return effect;
  };
  return { execute, withMutation };
}
