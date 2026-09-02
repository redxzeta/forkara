// FILE: desktopIdentity.ts
// Purpose: Defines the canonical desktop application identity across packaging and runtime.

export const FORKARA_DESKTOP_SCHEME = "forkara";
export const FORKARA_DESKTOP_ORIGIN = `${FORKARA_DESKTOP_SCHEME}://app`;
export const FORKARA_DESKTOP_ENTRY_URL = `${FORKARA_DESKTOP_ORIGIN}/index.html`;
export const FORKARA_DESKTOP_UPDATE_CHANNEL = "forkara";
export const FORKARA_PRODUCTION_BUNDLE_ID = "com.emanueledipietro.forkara";
export const FORKARA_DEVELOPMENT_BUNDLE_ID = `${FORKARA_PRODUCTION_BUNDLE_ID}.dev`;
export const FORKARA_CANARY_BUNDLE_ID = `${FORKARA_PRODUCTION_BUNDLE_ID}.canary`;
export const FORKARA_CANARY_DESKTOP_SCHEME = "forkara-canary";
export const FORKARA_CANARY_DESKTOP_ORIGIN = `${FORKARA_CANARY_DESKTOP_SCHEME}://app`;
export const FORKARA_CANARY_DESKTOP_ENTRY_URL = `${FORKARA_CANARY_DESKTOP_ORIGIN}/index.html`;

export type ForkaraDesktopFlavor = "production" | "development" | "canary";

export interface ForkaraDesktopIdentity {
  readonly flavor: ForkaraDesktopFlavor;
  readonly displayName: string;
  readonly bundleId: string;
  readonly scheme: string;
  readonly origin: string;
  readonly entryUrl: string;
  readonly userDataDirectoryName: string;
  readonly defaultHomeDirectoryName: string;
  readonly usesScriptedUpdates: boolean;
}

export function resolveForkaraDesktopFlavor(input: {
  readonly isDevelopment: boolean;
  readonly requestedFlavor?: string | undefined;
}): ForkaraDesktopFlavor {
  if (input.requestedFlavor?.trim().toLowerCase() === "canary") {
    return "canary";
  }
  return input.isDevelopment ? "development" : "production";
}

export function forkaraDesktopIdentity(flavor: ForkaraDesktopFlavor): ForkaraDesktopIdentity {
  if (flavor === "canary") {
    return {
      flavor,
      displayName: "Forkara Canary",
      bundleId: FORKARA_CANARY_BUNDLE_ID,
      scheme: FORKARA_CANARY_DESKTOP_SCHEME,
      origin: FORKARA_CANARY_DESKTOP_ORIGIN,
      entryUrl: FORKARA_CANARY_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "forkara-canary",
      defaultHomeDirectoryName: ".forkara-canary",
      usesScriptedUpdates: true,
    };
  }
  if (flavor === "development") {
    return {
      flavor,
      displayName: "Forkara (Dev)",
      bundleId: FORKARA_DEVELOPMENT_BUNDLE_ID,
      scheme: FORKARA_DESKTOP_SCHEME,
      origin: FORKARA_DESKTOP_ORIGIN,
      entryUrl: FORKARA_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "forkara-dev",
      defaultHomeDirectoryName: ".forkara",
      usesScriptedUpdates: false,
    };
  }
  return {
    flavor,
    displayName: "Forkara",
    bundleId: FORKARA_PRODUCTION_BUNDLE_ID,
    scheme: FORKARA_DESKTOP_SCHEME,
    origin: FORKARA_DESKTOP_ORIGIN,
    entryUrl: FORKARA_DESKTOP_ENTRY_URL,
    userDataDirectoryName: "forkara",
    defaultHomeDirectoryName: ".forkara",
    usesScriptedUpdates: false,
  };
}

export function forkaraBundleId(isDevelopment: boolean): string {
  return forkaraDesktopIdentity(isDevelopment ? "development" : "production").bundleId;
}
