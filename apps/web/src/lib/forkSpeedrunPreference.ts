// FILE: forkSpeedrunPreference.ts
// Purpose: Local-only per-project opt-in for displaying Fork Speedrun receipts.
// Layer: Web persistence helper; never sends preference state off device.

const STORAGE_KEY = "synara:fork-speedrun-opt-in:v1";

function decodeProjectIds(value: string | null): Set<string> {
  const decoded: unknown = JSON.parse(value ?? "[]");
  return new Set(
    Array.isArray(decoded)
      ? decoded.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      : [],
  );
}

export function isForkSpeedrunEnabled(
  projectId: string,
  storage: Pick<Storage, "getItem">,
): boolean {
  try {
    return decodeProjectIds(storage.getItem(STORAGE_KEY)).has(projectId);
  } catch {
    return false;
  }
}

export function setForkSpeedrunEnabled(
  projectId: string,
  enabled: boolean,
  storage: Pick<Storage, "getItem" | "setItem">,
): boolean {
  try {
    const projectIds = decodeProjectIds(storage.getItem(STORAGE_KEY));
    if (enabled) projectIds.add(projectId);
    else projectIds.delete(projectId);
    storage.setItem(STORAGE_KEY, JSON.stringify([...projectIds].toSorted()));
    return true;
  } catch {
    return false;
  }
}
