import type { ClientOrchestrationCommand } from "@forkara/contracts";
import { describe, expect, it, vi } from "vitest";

import { startLogoGenerationThread } from "./logoRebrandDispatch";

describe("startLogoGenerationThread", () => {
  it("uses a normal local approval thread and never dispatches a repository mutation command", async () => {
    const commands: ClientOrchestrationCommand[] = [];
    const dispatchCommand = vi.fn(async (command: ClientOrchestrationCommand) => {
      commands.push(command);
      return { sequence: commands.length };
    });
    await startLogoGenerationThread({
      api: { dispatchCommand },
      projectId: "project-1" as never,
      projectName: "Example",
      modelSelection: { provider: "codex", model: "gpt-5.6-sol" },
      prompt: "Generate an image_generation artifact only.",
      now: () => new Date("2026-08-24T00:00:00.000Z"),
      makeThreadId: () => "generation-thread" as never,
    });

    expect(commands.map((command) => command.type)).toEqual(["thread.create", "thread.turn.start"]);
    expect(commands[0]).toMatchObject({
      runtimeMode: "approval-required",
      envMode: "local",
      worktreePath: null,
    });
    expect(commands.some((command) => command.type.startsWith("git."))).toBe(false);
  });

  it("deletes the empty generation thread when turn dispatch fails", async () => {
    const commands: ClientOrchestrationCommand[] = [];
    const dispatchCommand = vi.fn(async (command: ClientOrchestrationCommand) => {
      commands.push(command);
      if (command.type === "thread.turn.start") throw new Error("unsupported");
      return { sequence: commands.length };
    });
    await expect(
      startLogoGenerationThread({
        api: { dispatchCommand },
        projectId: "project-1" as never,
        projectName: "Example",
        modelSelection: { provider: "codex", model: "gpt-5.6-sol" },
        prompt: "Generate",
        makeThreadId: () => "generation-thread" as never,
      }),
    ).rejects.toThrow("unsupported");
    expect(commands.at(-1)?.type).toBe("thread.delete");
  });
});
