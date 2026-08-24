import "../../index.css";

import { page } from "vitest/browser";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { projectParodyMergeFlexCard } from "~/lib/mergeFlexCard";
import { MergeFlexCard } from "./MergeFlexShareCard";

describe("MergeFlexCard", () => {
  it("keeps the maximum parody count and baked-in labels inside the export geometry", async () => {
    await render(
      <MergeFlexCard model={projectParodyMergeFlexCard({ count: 999_999, date: "2026-08-24" })} />,
    );

    const card = page.getByLabelText(/PARODY: 999,999 alleged prs merged today/i);
    await expect.element(card).toBeInTheDocument();
    const cardElement = card.element() as HTMLElement;
    expect(cardElement.offsetWidth).toBe(1200);
    expect(cardElement.offsetHeight).toBe(675);

    for (const text of [
      "RESUME-DRIVEN DEVELOPMENT",
      "PARODY",
      "ALLEGED PRs MERGED TODAY",
      "999,999",
      "Source: vibes · Audited by absolutely nobody.",
    ]) {
      const element = page.getByText(text, { exact: true }).element() as HTMLElement;
      const cardRect = cardElement.getBoundingClientRect();
      const contentRect = element.getBoundingClientRect();
      expect(contentRect.left).toBeGreaterThanOrEqual(cardRect.left);
      expect(contentRect.right).toBeLessThanOrEqual(cardRect.right);
      expect(contentRect.top).toBeGreaterThanOrEqual(cardRect.top);
      expect(contentRect.bottom).toBeLessThanOrEqual(cardRect.bottom);
    }
  });
});
