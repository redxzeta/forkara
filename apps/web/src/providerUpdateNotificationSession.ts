// FILE: providerUpdateNotificationSession.ts
// Purpose: Session-wide provider-version notification coalescing across route remounts.
// Layer: Web state

export interface ProviderUpdateNotificationSession {
  readonly claim: (versionStateKey: string) => boolean;
  readonly hasSeen: (versionStateKey: string) => boolean;
}

export function createProviderUpdateNotificationSession(): ProviderUpdateNotificationSession {
  const seenVersionStates = new Set<string>();
  return {
    claim: (versionStateKey) => {
      if (seenVersionStates.has(versionStateKey)) return false;
      seenVersionStates.add(versionStateKey);
      return true;
    },
    hasSeen: (versionStateKey) => seenVersionStates.has(versionStateKey),
  };
}

export const providerUpdateNotificationSession = createProviderUpdateNotificationSession();
