'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Within this many pixels of the end counts as "at the bottom". */
const BOTTOM_THRESHOLD_PX = 64;

/**
 * Keeps a scroll container pinned to its end while its content grows, until the user scrolls
 * up; then `pinned` turns false (for a "Jump to latest" button). Reaching the end re-pins it.
 */
export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);

  const setPinnedState = useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinned(next);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    let lastTop = scroller.scrollTop;

    function onScroll() {
      if (!scroller) return;
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      // Only an upward move unpins: growing content also increases the distance.
      const movedUp = scroller.scrollTop < lastTop - 1;
      lastTop = scroller.scrollTop;
      if (distance <= BOTTOM_THRESHOLD_PX) {
        if (!pinnedRef.current) setPinnedState(true);
      } else if (movedUp && pinnedRef.current) {
        setPinnedState(false);
      }
    }

    const observer = new ResizeObserver(() => {
      if (!pinnedRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
      lastTop = scroller.scrollTop;
    });
    observer.observe(content);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [setPinnedState]);

  /** Pins again and scrolls to the end (smoothly for a click, instantly when sending). */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      setPinnedState(true);
      const scroller = scrollRef.current;
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior });
    },
    [setPinnedState],
  );

  return { scrollRef, contentRef, pinned, scrollToBottom };
}
