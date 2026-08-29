// FILE: confirmCoreAction.ts
// Purpose: Keeps default native confirmations while routing focus-mode actions to the queue.
// Layer: Web orchestration helper

import { confirmationQueueManager, type ConfirmationRequestInput } from "~/confirmationQueue";
import { isFocusModeRuntimeEnabled } from "~/focusModeRuntime";

export async function confirmCoreAction(input: {
  readonly confirmation: ConfirmationRequestInput;
  readonly defaultConfirm: () => Promise<boolean>;
}): Promise<boolean> {
  if (!isFocusModeRuntimeEnabled()) return input.defaultConfirm();
  return (await confirmationQueueManager.request(input.confirmation)) === "confirmed";
}
