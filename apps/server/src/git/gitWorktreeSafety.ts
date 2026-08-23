// FILE: gitWorktreeSafety.ts
// Purpose: Shared local-only dirty-worktree and unresolved-conflict facts.
// Layer: Server Git domain helper, executed exclusively through GitCore's command seam.

import { Effect } from "effect";

import type { GitCommandError } from "./Errors.ts";

interface ExecuteOptions {
  readonly allowNonZeroExit?: boolean;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

type Execute = (
  operation: string,
  cwd: string,
  args: readonly string[],
  options?: ExecuteOptions,
) => Effect.Effect<{ code: number; stdout: string; stderr: string }, GitCommandError>;

export function readGitWorktreeSafety(input: {
  readonly execute: Execute;
  readonly cwd: string;
  readonly operationPrefix: string;
}) {
  return Effect.gen(function* () {
    const [workingTree, conflicts] = yield* Effect.all(
      [
        input.execute(`${input.operationPrefix}.workingTree`, input.cwd, [
          "status",
          "--porcelain=v1",
          "-z",
        ]),
        input.execute(`${input.operationPrefix}.conflicts`, input.cwd, [
          "diff",
          "--name-only",
          "--diff-filter=U",
          "-z",
        ]),
      ],
      { concurrency: 2 },
    );
    return {
      hasWorkingTreeChanges: workingTree.stdout.length > 0,
      unresolvedConflictFiles: conflicts.stdout.split("\0").filter(Boolean),
    };
  });
}
