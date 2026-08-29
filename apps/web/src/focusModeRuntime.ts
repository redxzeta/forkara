// FILE: focusModeRuntime.ts
// Purpose: Session-local runtime switch used by imperative UI service facades.
// Layer: Web state

let focusModeEnabled = false;

export function setFocusModeRuntimeEnabled(enabled: boolean): void {
  focusModeEnabled = enabled;
}

export function isFocusModeRuntimeEnabled(): boolean {
  return focusModeEnabled;
}
