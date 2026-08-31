import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  toast: vi.fn(),
}));

vi.mock("../components/ui/toast", () => ({
  toastManager: { add: harness.toast },
}));

import { copyPathToClipboard, copyTextToClipboard } from "./useCopyToClipboard";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;

function installMockDocument(execCommandResult: boolean) {
  const activeElement = { focus: vi.fn() };
  const selection = {
    rangeCount: 0,
    getRangeAt: vi.fn(),
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
  };
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
    remove: vi.fn(),
  };
  const documentMock = {
    activeElement,
    body: {
      appendChild: vi.fn(),
    },
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn().mockReturnValue(execCommandResult),
    getSelection: vi.fn(() => selection),
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock,
  });

  return { activeElement, documentMock, selection, textarea };
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }

  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
  } else {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  }

  if (originalNavigator === undefined) {
    Reflect.deleteProperty(globalThis, "navigator");
  } else {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }

  vi.restoreAllMocks();
  harness.toast.mockReset();
});

describe("copyPathToClipboard", () => {
  it("copies relative paths through the Clipboard API with consistent success feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    await expect(copyPathToClipboard("src/app.ts")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("src/app.ts");
    expect(harness.toast).toHaveBeenCalledWith({
      type: "success",
      title: "Path copied",
      description: "src/app.ts",
    });
  });

  it("copies absolute paths through the fallback when the Clipboard API rejects", async () => {
    const { documentMock } = installMockDocument(true);
    const writeText = vi.fn().mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    await expect(copyPathToClipboard("/repo/src/app.ts")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("/repo/src/app.ts");
    expect(documentMock.execCommand).toHaveBeenCalledWith("copy");
    expect(harness.toast).toHaveBeenCalledWith({
      type: "success",
      title: "Path copied",
      description: "/repo/src/app.ts",
    });
  });

  it("shows deterministic non-blocking failure feedback when copying is unavailable", async () => {
    installMockDocument(false);
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });

    await expect(copyPathToClipboard("src/app.ts")).resolves.toBe(false);

    expect(harness.toast).toHaveBeenCalledWith({
      type: "error",
      title: "Failed to copy path",
      description: "Clipboard API unavailable.",
    });
  });

  it("does not report an empty path as copied", async () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });

    await expect(copyPathToClipboard("")).resolves.toBe(false);

    expect(harness.toast).toHaveBeenCalledWith({
      type: "error",
      title: "Failed to copy path",
      description: "Path is empty.",
    });
  });
});

describe("copyTextToClipboard", () => {
  it("falls back to execCommand when navigator.clipboard.writeText rejects", async () => {
    const { documentMock } = installMockDocument(true);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new DOMException("Blocked", "NotAllowedError")),
        },
      },
    });

    await expect(copyTextToClipboard("hello")).resolves.toBeUndefined();
    expect(globalThis.navigator?.clipboard?.writeText).toHaveBeenCalledWith("hello");
    expect(documentMock.execCommand).toHaveBeenCalledWith("copy");
  });

  it("throws when neither clipboard API nor fallback copy is available", async () => {
    const { documentMock } = installMockDocument(false);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    await expect(copyTextToClipboard("hello")).rejects.toThrow("Clipboard API unavailable.");
    expect(documentMock.execCommand).toHaveBeenCalledWith("copy");
  });
});
