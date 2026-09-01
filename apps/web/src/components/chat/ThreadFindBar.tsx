// FILE: ThreadFindBar.tsx
// Purpose: Compact in-thread find panel floating at the top-right of the chat
//   column — field + close on top, prev/next + match count below.
// Layer: Chat transcript presentation
// Depends on: projected-message matching in threadFind.logic (not the DOM list).

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { DisclosureRegion } from "../ui/DisclosureRegion";
import { cn } from "~/lib/utils";
import { type TimelineEntry } from "../../session-logic";
import { CompactFindBar } from "./CompactFindBar";
import {
  collectThreadFindDocuments,
  createThreadFindDocumentTextCache,
  findThreadMatches,
  normalizeFindQuery,
  resolveThreadFindJump,
  stepThreadFindIndex,
  type ThreadFindHighlight,
  type ThreadFindMatch,
} from "./threadFind.logic";

interface ThreadFindBarProps {
  open: boolean;
  focusNonce: number;
  timelineEntries: readonly TimelineEntry[];
  onClose: () => void;
  onJump: (match: ThreadFindMatch) => void;
  onHighlightChange: (highlight: ThreadFindHighlight | null) => void;
  onActiveMatchChange: (match: ThreadFindMatch | null) => void;
}

export function ThreadFindBar({
  open,
  focusNonce,
  timelineEntries,
  onClose,
  onJump,
  onHighlightChange,
  onActiveMatchChange,
}: ThreadFindBarProps) {
  const matchesRef = useRef<ThreadFindMatch[]>([]);
  const activeIndexRef = useRef(0);
  const onJumpRef = useRef(onJump);
  const onHighlightChangeRef = useRef(onHighlightChange);
  const onActiveMatchChangeRef = useRef(onActiveMatchChange);
  onJumpRef.current = onJump;
  onHighlightChangeRef.current = onHighlightChange;
  onActiveMatchChangeRef.current = onActiveMatchChange;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);
  const [documentTextCache] = useState(createThreadFindDocumentTextCache);
  const documents = useMemo(
    () => (open ? collectThreadFindDocuments(timelineEntries, documentTextCache) : []),
    [documentTextCache, open, timelineEntries],
  );
  const matches = useMemo(
    () => findThreadMatches(documents, deferredQuery),
    [deferredQuery, documents],
  );
  matchesRef.current = matches;
  const matchCount = matches.length;
  const safeIndex = matchCount === 0 ? -1 : Math.min(Math.max(activeIndex, 0), matchCount - 1);
  const hasQuery = normalizeFindQuery(deferredQuery).length > 0;

  useEffect(() => {
    if (!open) {
      onHighlightChangeRef.current(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const currentIndex =
      matches.length === 0 ? -1 : Math.min(Math.max(activeIndexRef.current, 0), matches.length - 1);
    onHighlightChangeRef.current({
      query: deferredQuery,
      activeMatch: resolveThreadFindJump(matches, currentIndex),
    });
  }, [deferredQuery, matches, open]);

  // Query changes jump after their deferred match pass. Streaming transcript
  // rewrites only refresh matches and never yank the viewport mid-read.
  useEffect(() => {
    if (!open) {
      return;
    }
    const currentMatches = matchesRef.current;
    const currentIndex =
      currentMatches.length === 0
        ? -1
        : Math.min(Math.max(activeIndexRef.current, 0), currentMatches.length - 1);
    const match = currentMatches[currentIndex];
    onActiveMatchChangeRef.current(match ?? null);
    if (match) {
      onJumpRef.current(match);
    }
  }, [deferredQuery, open]);

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    activeIndexRef.current = 0;
    setActiveIndex(0);
  };

  const handleStep = (direction: "next" | "previous") => {
    if (deferredQuery !== query || matchCount === 0) {
      return;
    }
    const nextIndex = stepThreadFindIndex(matchCount, safeIndex, direction);
    const match = resolveThreadFindJump(matches, nextIndex);
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    onActiveMatchChangeRef.current(match);
    if (match) {
      onJumpRef.current(match);
    }
  };

  return (
    <CompactFindBar
      open={open}
      focusNonce={focusNonce}
      query={query}
      placeholder="Search chat..."
      inputLabel="Find in thread"
      testId="thread-find-bar"
      layout="thread"
      resultsLabel={
        hasQuery
          ? matchCount === 0
            ? "No results"
            : `${safeIndex + 1} / ${matchCount} results`
          : ""
      }
      canStep={deferredQuery === query && matchCount > 0}
      seedFromSelection
      onQueryChange={handleQueryChange}
      onStep={handleStep}
      onClose={onClose}
    />
  );
}

export function ChatThreadFindHost({
  open,
  focusNonce,
  timelineEntries,
  threadId,
  className,
  onClose,
  onJump,
  onHighlightChange,
  onActiveMatchChange,
}: ThreadFindBarProps & {
  threadId: string;
  className?: string;
}) {
  return (
    // Mounted at the chat pane root so the panel overlays the header and the
    // docked Environment overlay (z-20) alike, pinned to the top-right corner.
    <div
      data-thread-find-host="true"
      className={cn("pointer-events-none absolute right-0 top-0 z-40", className)}
    >
      {/* Content padding keeps the panel shadow inside the disclosure clip box
          and keeps the card off the pane borders. */}
      <DisclosureRegion open={open} contentClassName="pointer-events-auto p-3">
        <ThreadFindBar
          key={threadId}
          open={open}
          focusNonce={focusNonce}
          timelineEntries={timelineEntries}
          onClose={onClose}
          onJump={onJump}
          onHighlightChange={onHighlightChange}
          onActiveMatchChange={onActiveMatchChange}
        />
      </DisclosureRegion>
    </div>
  );
}
