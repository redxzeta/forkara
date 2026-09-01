// FILE: CompactFindBar.tsx
// Purpose: Shared compact find controls for thread and active-file search.
// Layer: Chat/editor presentation primitive

import { useEffect, useRef, type KeyboardEvent } from "react";

import { IconButton } from "~/components/ui/icon-button";
import { ArrowDownIcon, ArrowUpIcon, SearchIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { MUTED_LABEL_TEXT_CLASS_NAME } from "~/surfaceStyles";
import { DisclosureRegion } from "../ui/DisclosureRegion";

const FIND_QUERY_MAX_LENGTH = 200;

const FIND_STEP_BUTTON_CLASS_NAME =
  "size-6 rounded-md border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-muted-foreground/15 hover:text-foreground sm:size-6";

export function CompactFindBar(props: {
  open: boolean;
  focusNonce: number;
  query: string;
  placeholder: string;
  inputLabel: string;
  testId: string;
  layout: "thread" | "file";
  resultsLabel: string;
  canStep: boolean;
  seedFromSelection?: boolean;
  onQueryChange: (query: string) => void;
  onStep: (direction: "next" | "previous") => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onQueryChangeRef = useRef(props.onQueryChange);
  onQueryChangeRef.current = props.onQueryChange;

  useEffect(() => {
    if (!props.open) {
      return;
    }
    const input = inputRef.current;
    if (!input) {
      return;
    }
    if (
      props.seedFromSelection &&
      document.activeElement !== input &&
      input.value.trim().length === 0
    ) {
      const selected = window.getSelection()?.toString().trim() ?? "";
      if (selected.length > 0) {
        onQueryChangeRef.current(selected.slice(0, FIND_QUERY_MAX_LENGTH));
      }
    }
    input.focus();
    input.select();
  }, [props.focusNonce, props.open, props.seedFromSelection]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      props.onStep(event.shiftKey ? "previous" : "next");
    }
  };

  const resultsRowVisible = props.query.trim().length > 0;

  return (
    <div
      role="search"
      data-testid={props.testId}
      data-find-layout="panel"
      data-thread-find-layout={props.layout === "thread" ? "panel" : undefined}
      data-file-find-layout={props.layout === "file" ? "panel" : undefined}
      className="flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-3xl border border-border/60 bg-[var(--color-background-elevated-primary-opaque)] shadow-lg"
    >
      <div className="flex items-center gap-2.5 px-4">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={props.placeholder}
          aria-label={props.inputLabel}
          autoComplete="off"
          spellCheck={false}
          className="font-system-ui h-11 min-w-0 flex-1 bg-transparent text-[length:var(--app-font-size-ui,12px)] text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
        <IconButton
          onClick={props.onClose}
          className={FIND_STEP_BUTTON_CLASS_NAME}
          label="Close find (Esc)"
        >
          <XIcon className="size-4" />
        </IconButton>
      </div>
      <DisclosureRegion open={resultsRowVisible}>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              onClick={() => props.onStep("previous")}
              disabled={!props.canStep}
              className={FIND_STEP_BUTTON_CLASS_NAME}
              label="Previous match (Shift+Enter)"
            >
              <ArrowUpIcon className="size-4" />
            </IconButton>
            <IconButton
              onClick={() => props.onStep("next")}
              disabled={!props.canStep}
              className={FIND_STEP_BUTTON_CLASS_NAME}
              label="Next match (Enter)"
            >
              <ArrowDownIcon className="size-4" />
            </IconButton>
          </div>
          <span
            className={cn(
              "min-w-0 truncate pr-1 text-right text-[length:var(--app-font-size-ui-sm,11px)] tabular-nums",
              MUTED_LABEL_TEXT_CLASS_NAME,
            )}
            aria-live="polite"
          >
            {props.resultsLabel}
          </span>
        </div>
      </DisclosureRegion>
    </div>
  );
}
