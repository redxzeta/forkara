import { describe, expect, it } from "vitest";

import {
  resolveForkaraDesktopFlavor,
  FORKARA_CANARY_BUNDLE_ID,
  FORKARA_CANARY_DESKTOP_ENTRY_URL,
  FORKARA_CANARY_DESKTOP_ORIGIN,
  FORKARA_DESKTOP_ENTRY_URL,
  FORKARA_DESKTOP_ORIGIN,
  FORKARA_DESKTOP_UPDATE_CHANNEL,
  FORKARA_DEVELOPMENT_BUNDLE_ID,
  FORKARA_PRODUCTION_BUNDLE_ID,
  forkaraBundleId,
  forkaraDesktopIdentity,
} from "./desktopIdentity";

describe("desktopIdentity", () => {
  it("uses the exact canonical production and development bundle IDs", () => {
    expect(FORKARA_PRODUCTION_BUNDLE_ID).toBe("com.emanueledipietro.forkara");
    expect(FORKARA_DEVELOPMENT_BUNDLE_ID).toBe("com.emanueledipietro.forkara.dev");
    expect(forkaraBundleId(false)).toBe(FORKARA_PRODUCTION_BUNDLE_ID);
    expect(forkaraBundleId(true)).toBe(FORKARA_DEVELOPMENT_BUNDLE_ID);
  });

  it("uses the exact packaged renderer origin and entry URL", () => {
    expect(FORKARA_DESKTOP_ORIGIN).toBe("forkara://app");
    expect(FORKARA_DESKTOP_ENTRY_URL).toBe("forkara://app/index.html");
  });

  it("uses the isolated Forkara desktop update channel", () => {
    expect(FORKARA_DESKTOP_UPDATE_CHANNEL).toBe("forkara");
  });

  it("gives Canary a fully separate desktop identity and storage profile", () => {
    expect(FORKARA_CANARY_BUNDLE_ID).toBe("com.emanueledipietro.forkara.canary");
    expect(FORKARA_CANARY_DESKTOP_ORIGIN).toBe("forkara-canary://app");
    expect(FORKARA_CANARY_DESKTOP_ENTRY_URL).toBe("forkara-canary://app/index.html");
    expect(forkaraDesktopIdentity("canary")).toEqual({
      flavor: "canary",
      displayName: "Forkara Canary",
      bundleId: FORKARA_CANARY_BUNDLE_ID,
      scheme: "forkara-canary",
      origin: FORKARA_CANARY_DESKTOP_ORIGIN,
      entryUrl: FORKARA_CANARY_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "forkara-canary",
      defaultHomeDirectoryName: ".forkara-canary",
      usesScriptedUpdates: true,
    });
  });

  it("selects Canary explicitly without changing normal dev and production defaults", () => {
    expect(resolveForkaraDesktopFlavor({ isDevelopment: false })).toBe("production");
    expect(resolveForkaraDesktopFlavor({ isDevelopment: true })).toBe("development");
    expect(resolveForkaraDesktopFlavor({ isDevelopment: false, requestedFlavor: " canary " })).toBe(
      "canary",
    );
    expect(resolveForkaraDesktopFlavor({ isDevelopment: true, requestedFlavor: "canary" })).toBe(
      "canary",
    );
  });
});
