import type { MergeFlexReceiptsResult } from "@forkara/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  composeMergeFlexFactualDraft,
  composeMergeFlexParodyDraft,
  countUnicodeCharacters,
  createMergeFlexPostGate,
  factualShareableRepository,
  finalizeMergeFlexParodyPost,
  hasMergeFlexParodyMarker,
  makeMergeFlexMockAgentPrompt,
  makeMockMergeReceipts,
  MERGE_FLEX_PARODY_COUNT_MAX,
  MERGE_FLEX_PARODY_MARKER,
  MERGE_FLEX_PARODY_PRESETS,
  mergeFlexScopeLabel,
  parseMergeFlexParodyCount,
  startExplicitMergeFlexPost,
} from "./mergeFlexComposer";

function result(
  scope: MergeFlexReceiptsResult["scope"],
  visibility: MergeFlexReceiptsResult["receipts"][number]["repositoryVisibility"] = "public",
): MergeFlexReceiptsResult {
  const repository = scope.type === "repository" ? scope.repository : "acme/widgets";
  return {
    date: "2026-08-24",
    startedAt: "2026-08-24T07:00:00.000Z",
    endedAt: "2026-08-25T07:00:00.000Z",
    scope,
    viewer: "octocat",
    count: 1,
    incomplete: false,
    receipts: [
      {
        number: 42,
        title: "Ship factual receipts",
        url: `https://github.com/${repository}/pull/42`,
        repository,
        repositoryVisibility: visibility,
        authorLogin: "octocat",
        mergedAt: "2026-08-24T18:00:00.000Z",
      },
    ],
  };
}

describe("Merge Flex factual composer helpers", () => {
  it("composes deterministic singular and plural templates", () => {
    expect(
      composeMergeFlexFactualDraft("receipts", {
        count: 1,
        date: "2026-08-24",
        incomplete: false,
        repository: null,
      }),
    ).toBe(
      "1 PR landed on 2026-08-24. Git has receipts. Forkara has a button for bragging about it.",
    );
    expect(
      composeMergeFlexFactualDraft("problem", {
        count: 3,
        date: "2026-08-24",
        incomplete: false,
        repository: null,
      }),
    ).toBe(
      "3 pull requests landed on 2026-08-24. I have chosen to make this everyone else's problem.",
    );
  });

  it("states incomplete receipt counts as verified lower bounds", () => {
    expect(
      composeMergeFlexFactualDraft("receipts", {
        count: 1_000,
        date: "2026-08-24",
        incomplete: true,
        repository: null,
      }),
    ).toBe(
      "At least 1000 PRs landed on 2026-08-24. Git has receipts. Forkara has a button for bragging about it.",
    );
  });

  it("keeps repository identity absent until an eligible public repository is selected", () => {
    const privateResult = result({ type: "repository", repository: "acme/private" }, "private");
    const unknownResult = result({ type: "repository", repository: "acme/unknown" }, "unknown");
    const allResult = result({ type: "all" });
    const publicResult = result({ type: "repository", repository: "acme/widgets" });

    expect(factualShareableRepository(privateResult)).toBeNull();
    expect(factualShareableRepository(unknownResult)).toBeNull();
    expect(factualShareableRepository(allResult)).toBeNull();
    expect(factualShareableRepository(publicResult)).toBe("acme/widgets");
    expect(mergeFlexScopeLabel(publicResult)).toBe("Current repository");

    const defaultDraft = composeMergeFlexFactualDraft("normal", {
      count: publicResult.count,
      date: publicResult.date,
      incomplete: publicResult.incomplete,
      repository: null,
    });
    expect(defaultDraft).not.toContain("acme/widgets");
    expect(
      composeMergeFlexFactualDraft("normal", {
        count: publicResult.count,
        date: publicResult.date,
        incomplete: publicResult.incomplete,
        repository: factualShareableRepository(publicResult),
      }),
    ).toContain("acme/widgets");
  });

  it("counts visible Unicode code points for the live character display", () => {
    expect(countUnicodeCharacters("PR 🍴")).toBe(4);
  });

  it("starts only an explicit connected submission and blocks a duplicate in flight", async () => {
    let resolvePost!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolvePost = resolve;
    });
    const post = vi.fn(() => pending);
    const gate = createMergeFlexPostGate();

    expect(startExplicitMergeFlexPost(gate, { connected: false, text: "draft" }, post)).toBeNull();
    expect(startExplicitMergeFlexPost(gate, { connected: true, text: "   " }, post)).toBeNull();
    const submission = startExplicitMergeFlexPost(
      gate,
      { connected: true, text: "  reviewed draft  " },
      post,
    );
    expect(submission).not.toBeNull();
    expect(
      startExplicitMergeFlexPost(gate, { connected: true, text: "duplicate" }, post),
    ).toBeNull();
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith("  reviewed draft  ");

    resolvePost("posted");
    await expect(submission).resolves.toEqual({ status: "success", result: "posted" });
    expect(gate.inFlight).toBe(false);
  });

  it("reports a posting failure without mutating the caller's draft", async () => {
    const draft = "Keep this exact draft";
    const submission = startExplicitMergeFlexPost(
      createMergeFlexPostGate(),
      { connected: true, text: draft },
      async () => {
        throw new Error("rate limited");
      },
    );

    await expect(submission).resolves.toMatchObject({ status: "error" });
    expect(draft).toBe("Keep this exact draft");
  });

  it("composes deterministic parody copy and enforces a non-editable final marker", () => {
    const draft = composeMergeFlexParodyDraft("resume", {
      count: 1,
      date: "2026-08-24",
    });
    expect(draft).toBe("Resume-Driven Development is going great: 1 alleged merge on 2026-08-24.");
    expect(draft).not.toContain(MERGE_FLEX_PARODY_MARKER);

    const editedDraft = "Totally authentic, trust me";
    const finalPost = finalizeMergeFlexParodyPost(editedDraft);
    expect(finalPost).toBe(`${editedDraft}\n\n${MERGE_FLEX_PARODY_MARKER}`);
    expect(hasMergeFlexParodyMarker(finalPost)).toBe(true);
    expect(hasMergeFlexParodyMarker(editedDraft)).toBe(false);
  });

  it("accepts only bounded whole-number parody counts and exposes deterministic presets", () => {
    expect(parseMergeFlexParodyCount("0")).toBe(0);
    expect(parseMergeFlexParodyCount(String(MERGE_FLEX_PARODY_COUNT_MAX))).toBe(
      MERGE_FLEX_PARODY_COUNT_MAX,
    );
    expect(parseMergeFlexParodyCount("-1")).toBeNull();
    expect(parseMergeFlexParodyCount("1.5")).toBeNull();
    expect(parseMergeFlexParodyCount("1000000")).toBeNull();
    expect(MERGE_FLEX_PARODY_PRESETS.map((preset) => preset.count)).toEqual([
      7,
      42,
      69,
      100,
      MERGE_FLEX_PARODY_COUNT_MAX,
    ]);
  });

  it("generates stable seeded in-memory receipts using the existing receipt shape", () => {
    const first = makeMockMergeReceipts({ count: 4, date: "2026-08-24", seed: 17 });
    const repeated = makeMockMergeReceipts({ count: 4, date: "2026-08-24", seed: 17 });
    const different = makeMockMergeReceipts({ count: 4, date: "2026-08-24", seed: 18 });

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(different);
    expect(first).toHaveLength(4);
    expect(first.map((receipt) => receipt.repositoryVisibility)).toEqual([
      "public",
      "private",
      "internal",
      "unknown",
    ]);
    expect(first.every((receipt) => receipt.title.startsWith("[Mock]"))).toBe(true);
    expect(first.every((receipt) => receipt.url.includes(".invalid/"))).toBe(true);
    expect(first.every((receipt) => !receipt.url.includes("github.com"))).toBe(true);
    expect(makeMockMergeReceipts({ count: 0, date: "2026-08-24" })).toEqual([]);
    expect(() => makeMockMergeReceipts({ count: -1, date: "2026-08-24" })).toThrow(RangeError);
  });

  it("builds the required local-only agent prompt with runtime count and date", () => {
    const prompt = makeMergeFlexMockAgentPrompt({ count: 42, date: "2026-08-24" });
    expect(prompt).toContain("Create exactly 42 mock pull-request receipt records for 2026-08-24");
    expect(prompt).toContain("Do not run `gh pr create`, `gh api` mutations, `git push`");
    expect(prompt).toContain("Do not create commits or branches solely for this task");
    expect(prompt).toContain("confirm that no GitHub or Git write operation was performed");
  });
});
