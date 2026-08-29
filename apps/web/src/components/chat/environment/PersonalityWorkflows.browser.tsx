// FILE: PersonalityWorkflows.browser.tsx
// Purpose: Playwright-backed smoke coverage for stateful Fork Lore workflows.
// Layer: Browser integration tests with disposable local state and cached Git fixtures.

import "../../../index.css";

import {
  ProjectId,
  type GitForkSpeedrunResult,
  type GitOriginalityMeterResult,
} from "@forkara/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { getAchievementSnapshot, resetAchievementState } from "~/achievements/engine";
import { ForkTypeLorePanel } from "~/components/settings/ForkTypeLorePanel";
import { gitQueryKeys } from "~/lib/gitReactQuery";

import { EnvironmentApologyProgressionSection } from "./EnvironmentApologyProgressionSection";
import { EnvironmentForkSpeedrunSection } from "./EnvironmentForkSpeedrunSection";
import { EnvironmentOriginalityMeterSection } from "./EnvironmentOriginalityMeterSection";

const PROJECT_ID = ProjectId.makeUnsafe("project-personality-smoke");
const CWD = "/fixtures/personality-smoke";
const PROJECT_CREATED_AT = "2026-08-29T07:00:00.000Z";
const mountedScreens: Array<{ unmount: () => void }> = [];

function trackScreen<T extends { unmount: () => void }>(screen: T): T {
  mountedScreens.push(screen);
  return screen;
}

function untrackScreen(screen: { unmount: () => void }): void {
  const index = mountedScreens.indexOf(screen);
  if (index >= 0) mountedScreens.splice(index, 1);
}

function queryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function speedrunResult(): GitForkSpeedrunResult {
  return {
    state: "ready",
    message: "Milestones derived from the disposable Git fixture.",
    startedAt: PROJECT_CREATED_AT,
    events: [
      {
        kind: "project_added",
        label: "Project added to Forkara",
        occurredAt: PROJECT_CREATED_AT,
        elapsedSeconds: 0,
        commit: null,
      },
      {
        kind: "readme_changed",
        label: "README changed",
        occurredAt: "2026-08-29T07:08:41.000Z",
        elapsedSeconds: 521,
        commit: {
          sha: "a".repeat(40),
          shortSha: "aaaaaaa",
          subject: "Update fixture README",
        },
      },
    ],
    missingEvents: ["first_fork_commit"],
  };
}

function originalityResult(
  state: GitOriginalityMeterResult["state"],
  scorePercent: number | null,
): GitOriginalityMeterResult {
  return {
    state,
    message:
      state === "ready"
        ? "Computed from the disposable Git fixture."
        : "Configure and refresh an upstream remote.",
    scorePercent,
    changedFileCount: state === "ready" ? 0 : 0,
    comparableFileCount: state === "ready" ? 4 : 0,
    insertions: 0,
    deletions: 0,
    binaryFileCount: 0,
    excludedFileCount: 0,
    forkUniqueCommitCount: 0,
    upstreamUniqueCommitCount: 0,
    calculationVersion: "changed_eligible_files_v1",
    exclusionRules: [],
  };
}

function hasAchievement(id: string): boolean {
  return getAchievementSnapshot().some((unlock) => unlock.id === id);
}

describe("Forkara personality workflows", () => {
  afterEach(async () => {
    for (const screen of mountedScreens.splice(0).toReversed()) {
      await screen.unmount();
    }
    resetAchievementState();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("[personality-smoke] advances all six apology stages and resets", async () => {
    trackScreen(
      await render(<EnvironmentApologyProgressionSection projectId={PROJECT_ID} enabled />),
    );

    await page.getByRole("button", { name: "Apology Progression" }).click();
    const advance = page.getByRole("button", { name: "Proceed to next stage" });
    for (let stage = 1; stage < 6; stage += 1) {
      await userEvent.click(advance);
    }

    await expect.element(page.getByText("Stage 6 of 6")).toBeInTheDocument();
    expect(hasAchievement("redemption_arc")).toBe(true);
    await page.getByRole("button", { name: "Reset progression" }).click();
    await expect.element(page.getByText("Stage 1 of 6")).toBeInTheDocument();
  });

  it("[personality-smoke] opts into a receipt-backed speedrun timeline and opts out", async () => {
    const client = queryClient();
    client.setQueryData([...gitQueryKeys.forkSpeedrun(CWD), PROJECT_CREATED_AT], speedrunResult());
    trackScreen(
      await render(
        <QueryClientProvider client={client}>
          <EnvironmentForkSpeedrunSection
            gitCwd={CWD}
            projectId={PROJECT_ID}
            projectCreatedAt={PROJECT_CREATED_AT}
            enabled
          />
        </QueryClientProvider>,
      ),
    );

    await page.getByRole("button", { name: "Fork Speedrun" }).click();
    await page.getByRole("button", { name: "Show my local timeline" }).click();
    await expect
      .element(page.getByRole("heading", { name: "Fork Speedrun", level: 3 }))
      .toBeInTheDocument();
    await expect.element(page.getByText("README changed", { exact: true }).first()).toBeVisible();
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-08-29T07:00:00.000Z",
    );

    await page.getByRole("button", { name: "Turn off Fork Speedrun" }).click();
    await expect.element(page.getByText("Fork Speedrun is off")).toBeInTheDocument();
  });

  it("[personality-smoke] distinguishes unavailable originality from a computed zero result", async () => {
    const unavailableClient = queryClient();
    unavailableClient.setQueryData(
      gitQueryKeys.originalityMeter(CWD),
      originalityResult("missing_upstream", null),
    );
    const unavailable = trackScreen(
      await render(
        <QueryClientProvider client={unavailableClient}>
          <EnvironmentOriginalityMeterSection gitCwd={CWD} enabled />
        </QueryClientProvider>,
      ),
    );
    await page.getByRole("button", { name: "Originality Meter™" }).click();
    await expect.element(page.getByText("Upstream required")).toBeInTheDocument();
    expect(hasAchievement("original_visionary")).toBe(false);
    await unavailable.unmount();
    untrackScreen(unavailable);

    const computedClient = queryClient();
    computedClient.setQueryData(gitQueryKeys.originalityMeter(CWD), originalityResult("ready", 0));
    trackScreen(
      await render(
        <QueryClientProvider client={computedClient}>
          <EnvironmentOriginalityMeterSection gitCwd={CWD} enabled />
        </QueryClientProvider>,
      ),
    );
    await page.getByRole("button", { name: "Originality Meter™" }).click();
    await expect.element(page.getByText("Originality: 0% ✨")).toBeInTheDocument();
    expect(hasAchievement("original_visionary")).toBe(true);
  });

  it("[personality-smoke] changes Fork Type lore and restores Git as the live mode", async () => {
    trackScreen(await render(<ForkTypeLorePanel />));

    const gitFork = page.getByRole("radio", { name: "Select Git fork" });
    const spork = page.getByRole("radio", { name: "Select Spork" });
    await expect.element(gitFork).toBeChecked();
    await userEvent.click(spork);
    await expect.element(spork).toBeChecked();
    await expect.element(page.getByText(/Selected identity:.*Spork.*lore/u)).toBeInTheDocument();

    await userEvent.click(gitFork);
    await expect.element(gitFork).toBeChecked();
    await expect
      .element(page.getByText(/Selected identity:.*Git fork.*Git operations/u))
      .toBeInTheDocument();
  });
});
