import type {
  ClientOrchestrationCommand,
  ModelSelection,
  ProjectId,
  ThreadId,
} from "@forkara/contracts";

import { newCommandId, newMessageId, newThreadId } from "./utils";

export interface LogoGenerationDispatchApi {
  readonly dispatchCommand: (
    command: ClientOrchestrationCommand,
  ) => Promise<{ readonly sequence: number }>;
}

export async function startLogoGenerationThread(input: {
  readonly api: LogoGenerationDispatchApi;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly modelSelection: ModelSelection;
  readonly prompt: string;
  readonly now?: () => Date;
  readonly makeThreadId?: () => ThreadId;
}): Promise<ThreadId> {
  const threadId = input.makeThreadId?.() ?? newThreadId();
  const createdAt = (input.now?.() ?? new Date()).toISOString();
  let created = false;
  try {
    await input.api.dispatchCommand({
      type: "thread.create",
      commandId: newCommandId(),
      threadId,
      projectId: input.projectId,
      title: `Generate logo for ${input.projectName}`,
      modelSelection: input.modelSelection,
      runtimeMode: "approval-required",
      interactionMode: "default",
      envMode: "local",
      branch: null,
      worktreePath: null,
      createdAt,
    });
    created = true;
    await input.api.dispatchCommand({
      type: "thread.turn.start",
      commandId: newCommandId(),
      threadId,
      message: {
        messageId: newMessageId(),
        role: "user",
        text: input.prompt.trim(),
        attachments: [],
      },
      modelSelection: input.modelSelection,
      runtimeMode: "approval-required",
      interactionMode: "default",
      dispatchMode: "queue",
      createdAt,
    });
    return threadId;
  } catch (cause) {
    if (created) {
      await input.api
        .dispatchCommand({
          type: "thread.delete",
          commandId: newCommandId(),
          threadId,
        })
        .catch(() => undefined);
    }
    throw cause;
  }
}
